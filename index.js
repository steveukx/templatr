
var fs = require('fs'),
	 jsdom = require('jsdom'),
	 xhr = require('xhrequest'),
	 EventEmitter = require( "events" ).EventEmitter;

function previousNode(fromNode) {
	var rtnNode, prevNode, curNode = fromNode;

	while(curNode && (curNode = curNode.previousSibling)) {
		if(curNode.nodeType == 1) {
			rtnNode = curNode;
			break;
		}
	}
	return rtnNode || null;
}

/**
 * The Template is a convenience method for storing the content of a template and precaching any 
 * JavaScript that it uses so that the template can be used repeatedly without making excess calls
 * to any middleware device.
 * 
 * @param {String} templateDir
 * @param {String} templateName
 * @constructor
 */
function Template(templateDir, templateName, options) {
	EventEmitter.call(this);

	this._options = options || 0;
	this._scripts = [];
	this._dir = templateDir + (templateDir.match(/\/$/) ? '' : '/');
	this._template = fs.readFileSync(this._dir + (templateName || 'template.htm'), 'utf8');

	if(options & Template.REMOVE_WHITE_SPACE) {
		this._template = this._template.replace(/>\s+</g, '><');
	}

	this._initialiseScripts();
}
Template.prototype = Object.create( EventEmitter.prototype );

/** @type BIT option for the Template constructor */
Template.REMOVE_WHITE_SPACE = 1;

/** @type {Script[]} */
Template.prototype._scripts = null;

/** @type {String} */
Template.prototype._template = null;

/** @type {String[]} */
Template.prototype._bundledScripts = null;

/**
 * Parses the template synchronously, gets any script tag in the document and issues requests for
 * the JavaScript that makes up the script tag. This method will cater for relative URLs assuming
 * that the template is in the root of the site and that the structure of the file system matches
 * that in the URLs. HTTP(S) linked files are asynchonously loaded and inline scripts are read
 * directly from the DOM.
 */
Template.prototype._initialiseScripts = function() {
	var doc = jsdom.jsdom(this._template, null, { features: {ProcessExternalResources : false} } ),
		 scripts = doc.getElementsByTagName('script'),
		 scriptContent = [];

	for(var i = 0, l = scripts.length; i < l; i++) {
		var script = this._scripts[i] = new Script(scripts[i], this._dir);
		script.on('ready', this._onScriptLoaded.bind(this));

		if(script.serverOnly) {
			scripts[i].parentNode.removeChild(scripts[i]);
		}
	}

	this._template = doc;
};

/**
 * Handler for when a Script tag fires the ready event.
 * 
 * @param {Script} script
 * @param {String} scriptContent
 */
Template.prototype._onScriptLoaded = function(script, scriptContent) {
	console.log('script loaded: ' + script.src);
	if(this._scripts.every(function(scr) { return scr.loaded; })) {
		this._finaliseTemplate();
	}
};

/**
 * Called once all requires external resources have been loaded, this will merge together any
 * script tags that are next to each other in the document to reduce the number of external
 * resources loaded by the client.
 */
Template.prototype._finaliseTemplate = function() {
	this._ready = true;

	var bundledScripts = [];
	this._scripts.forEach(function(itm) {
		if(itm.serverOnly) return;

		var node = itm.getNode();
		if(itm.isFollowOnScript()) {
			bundledScripts[bundledScripts.length - 1] += itm.content;
			node.parentNode.removeChild(node);
		}
		else {
			bundledScripts[bundledScripts.length] = itm.content;
			node.setAttribute('src', './script-' + (bundledScripts.length - 1) + '.js');
		}
	});

	this._bundledScripts = bundledScripts;
	this._template = this._template.doctype + this._template.innerHTML;

	console.log('Template ready for use...');
};

/**
 * Sets up an express / connect compatible middleware for creating the template and sending it out on a
 * response data object.
 */
Template.prototype.middleware = function() {
	return this._middleware.bind(this);
};

/**
 * Runs the template as an express / connect compatible middleware - essentially just creates the DOM,
 * runs all of the JavaScript and then outputs the resulting HTML.
 */
Template.prototype._middleware = function(req, res, next) {

	var url, staticContent;
	if(url = req.url.match(/script\-(\d+)\.js$/)) {
		if(staticContent = this._bundledScripts[url[1]]) {
			res.send(staticContent);
			return;
		}
	}

	var self = this;

	jsdom.env({
		html: this._template,
		scripts: [],
		src: [
			'document.location = "http://domain' + req.url + '";'
		].concat(this._scripts),
		done: function(errs, win) {
			self.emit('ready', win);

			process.nextTick(function() {
				res.send( win.document.doctype + win.document.innerHTML);
			});
		}
	});
};

/**
 * Runs the supplied script against the supplied document.
 * 
 * $param {Function|String} script
 * $param {Document} doc
 * $param {Window} win
 */
Template.runScript = function(script, window) {


	var scriptTag,
		 features = window.document.implementation._features,
		 doc = window.document,
		 docElement = doc.documentElement;

	scriptTag = doc.createElement('script');
	scriptTag.text = script.toString();
	if(typeof script == 'function') {
		scriptTag.text += '\n' + script.name + '();';
	}

	window.document.implementation.addFeature('FetchExternalResources', ['script']);
	window.document.implementation.addFeature('ProcessExternalResources', ['script']);
	window.document.implementation.addFeature('MutationEvents', ["1.0"]);

	docElement.appendChild(scriptTag);
	docElement.removeChild(scriptTag);

	window.document.implementation._features = features;
};

/**
 * The Script class wraps a SCRIPT element in the template document and is responsible for exposing
 * content of the script tag to the template.
 *
 * @param {Element} node
 * @param {String} srcPath
 * @extends {EventEmitter}
 */
function Script(node, srcPath) {

	EventEmitter.call(this);

	this._node = node;

	this.serverOnly = !!(node.getAttribute('runat') || '').match(/server/i);

	if(!node.src) {
		Script.readInlineScriptTag(this, node);
	}
	else {
		this.src = node.src;
		if(!this.src.match(/^http/)) {
			Script.readLocalScriptFile(this, srcPath + this.src);
		}
		else {
			Script.readRemoteScriptFile(this, this.src);
		}
	}
}
Script.prototype = Object.create( EventEmitter.prototype );

/** @type {Boolean} */
Script.prototype.loaded = false;

/** @type {String} */
Script.prototype.content = '';

/** @type {Boolean} */
Script.prototype.serverOnly = false;

/** @type {String} */
Script.prototype.src = '';

/**
 * Gets the node from the original parsing of the template that this Script instance represents
 * @return {Element}
 */
Script.prototype.getNode = function() {
	return this._node;
};

/**
 * Gets whether the current script follows immediately after another script tag. As this method will only be called
 * once server-only scripts have been removed from the template, it doesn't need to check for the runat attribute.
 * @return (Boolean}
 */
Script.prototype.isFollowOnScript = function() {
	var prevNode = previousNode(this._node);
	try {
		return (prevNode.nodeName == 'SCRIPT');
	}
	catch(e) {
		console.log('die', e);
	}
};

/**
 * Reads the content of an inline script tag and on next tick pushes it into the Script instance
 * 
 * @param {Script} script
 * @param {Element} node
 */
Script.readInlineScriptTag = function(script, node) {
	process.nextTick(function() {
		script.setContent( node.firstChild && node.firstChild.nodeValue );
	});
};

/**
 * Reads the content of a relative script tag - assumes that the source of the script tag is relative
 * to the root of the website and that the root of the website is also the directory root for this template.
 * 
 * @param {Script} script
 * @param {String} src The base path for any relative URL
 */
Script.readLocalScriptFile = function(script, src) {
	fs.readFile(src, 'utf8', function(err,data) {
		script.setContent(data);
	});
};

/**
 * Reads the content of an script tag from any remote server.
 * 
 * @param {Script} script
 * @param {String} src The absolute URL for the script (currently must be either http or https)
 */
Script.readRemoteScriptFile = function(script, src) {
	xhr(src, {
		success: script.setContent.bind(script),
		error: script.setContent.bind(script, '')
	});
};

/**
 * Sets the contnet for the script tag to the supplied JavaScript contnet.
 * 
 * @param {String} content
 * @return {Script} this
 */
Script.prototype.setContent = function(content) {
	this.content = content;
	this.loaded = true;

	this.emit('ready', this, this.content);
	return this;
};

/**
 * Override default toString behaviour to return the actual content of the SCRIPT tag to allow
 * for easily concatenating an array of String instances into a single javascript file.
 * @return {String}
 */
Script.prototype.toString = function() {
	return this.content;
};

module.exports = Template;


