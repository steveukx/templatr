
var fs = require('fs'),
	 jsdom = require('jsdom'),
	 xhr = require('xhrequest'),
	 EventEmitter = require( "events" ).EventEmitter;

/**
 * The Template is a convenience method for storing the content of a template and precaching any 
 * JavaScript that it uses so that the template can be used repeatedly without making excess calls
 * to any middleware device.
 * 
 * @param {String} templateDir
 * @param {String} templateName
 * @constructor
 */
function Template(templateDir, templateName) {
	this._scripts = [];
	this._dir = templateDir + (templateDir.match(/\/$/) ? '' : '/');
	this._template = fs.readFileSync(this._dir + (templateName || 'template.htm'), 'utf8');

	this._initialiseScripts();
}

/** @type {Script[]} */
Template.prototype._scripts = null;

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

	this._template = doc.doctype + doc.innerHTML;
};

/**
 * Handler for when a Script tag fires the ready event.
 * 
 * @param {Script} script
 * @param {String} scriptContent
 */
Template.prototype._onScriptLoaded = function(script, scriptContent) {
	if(this._scripts.every(function(scr) { return scr.loaded; })) {
		this._ready = true;
		console.log('Template ready for use...');
//		console.log(this._template);
	}
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
	jsdom.env({
		html: this._template,
		scripts: [],
		src: this._scripts,
		done: function(errs, win) {
			res.send( win.document.doctype + win.document.innerHTML);
		}
	});
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


