
var fs = require('fs'),
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

module.exports = Script;


