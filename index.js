
var fs = require('fs'),
	 jsdom = require('jsdom'),
	 xhr = require('xhrequest');

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

/** @type {String[]} */
Template.prototype._scripts = null;

/**
 * Parses the template synchronously, gets any script tag in the document and issues requests for
 * the JavaScript that makes up the script tag. This method will cater for relative URLs assuming
 * that the template is in the root of the site and that the structure of the file system matches
 * that in the URLs. HTTP(S) linked files are asynchonously loaded and inline scripts are read
 * directly from the DOM.
 */
Template.prototype._initialiseScripts = function() {
	var doc = jsdom.jsdom(this._template),
		 scripts = doc.getElementsByTagName('script'),
		 scriptContent = [];

	for(var i = 0, l = scripts.length; i < l; i++) {
		this._scripts[i] = false;

		if(!scripts[i].src) {
			this._readScriptTag(i, scripts[i]);
		}
		else if(!scripts[i].src.match(/^http/i)) {
			this._readLocalScriptTag(i, scripts[i]);
		}
		else {
			this._readRemoteScriptTag(i, scripts[i]);
		}
	}
};

/**
 * Saves the content of a script tag at the given index in the array of scripts.
 * 
 * @param {Number} index
 * @param {String} script
 */
Template.prototype._saveScriptContent = function(index, script) {

console.log('adding ' + script.length + 'b to index ' + index);

	this._scripts[index] = script;
	if(this._scripts.indexOf(false) < 0) {
		this._ready = true;
		console.log('Template ready for use...');
	}
};

/**
 * Reads the content of an inline script tag.
 * 
 * @param {Number} index
 * @param {Element} tag
 */
Template.prototype._readScriptTag = function(index, tag) {
	this._saveScriptContent(index, tag.firstChild.nodeValue);
};

/**
 * Reads the content of a relative script tag - assumes that the source of the script tag is relative
 * to the root of the website and that the root of the website is also the directory root for this template.
 * 
 * @param {Number} index
 * @param {Element} tag
 */
Template.prototype._readLocalScriptTag = function(index, tag) {
//	this._saveScriptContent(index, fs.readFileSync(this._dir + tag.src, 'utf8'));
	fs.readFile(this._dir + tag.src, 'utf8', (function(err, data) { this._saveScriptContent(index, data); }).bind(this) );
};

/**
 * Reads the content of an script tag from any remote server.
 * 
 * @param {Number} index
 * @param {Element} tag
 */
Template.prototype._readRemoteScriptTag = function(index, tag) {
	xhr(tag.src, {
		success: this._saveScriptContent.bind(this, index),
		error: this._saveScriptContent.bind(this, index, '')
	});
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

module.exports = Template;


