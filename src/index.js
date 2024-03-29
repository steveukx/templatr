
var fs = require('fs'),
	 jsdom = require('jsdom'),
	 xhr = require('xhrequest'),
	 EventEmitter = require( "events" ).EventEmitter,

	 Script = require('./script'),
	 Response = require('./response');

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

/** @type {Number} BIT option for the Template constructor to remove any white space in the HTML of the template */
Template.REMOVE_WHITE_SPACE = 1;

/** @type {Number} BIT option for the Template constructor to merge consecutive script tags together */
Template.MERGE_SCRIPTS = 2;

/** @type {Number} BIT option for the Template constructor to print out detail of operations to the console */
Template.VERBOSE = 4;

/** @type {Script[]} */
Template.prototype._scripts = null;

/** @type {String} */
Template.prototype._template = null;

/** @type {String[]} */
Template.prototype._bundledScripts = null;

/**
 * This is the method that will print to the console when verbose mode has been enabled.
 * @ignore
 */
Template.prototype._log = function() {
   if(this._options & Template.VERBOSE) {
      console.log.apply(console, arguments);
   }
};

/**
 * Parses the template synchronously, gets any script tag in the document and issues requests for
 * the JavaScript that makes up the script tag. This method will cater for relative URLs assuming
 * that the template is in the root of the site and that the structure of the file system matches
 * that in the URLs. HTTP(S) linked files are asynchronously loaded and inline scripts are read
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
	this._log('script loaded: ' + script.src);
	if(this._scripts.every(function(_script) { return _script.loaded; })) {
		this._finaliseTemplate();
	}
};

/**
 * Called once all requires external resources have been loaded, this will merge together any
 * script tags that are next to each other in the document to reduce the number of external
 * resources loaded by the client.
 */
Template.prototype._finaliseTemplate = function() {
   var bundledScripts = [];

   if(this._options & Template.MERGE_SCRIPTS) {
      this._scripts.forEach(function(itm, index) {
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
   }

	this._bundledScripts = bundledScripts;
	this._template = this._template.doctype + this._template.innerHTML;

   this._log('Template ready for use...');
   this.emit(Template.TEMPLATE_PREPARED_EVENT, this);
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
			if(errs) throw errs;

			var response = new Response(win, res);
			self.emit(Template.INSTANCE_READY_EVENT, response);

			if(!response._waiting) {
				response.send();
			}
		}
	});
};

/**
 * Fired by the Template when a new document has been created and is ready to send to the client, handlers can make
 * changes to the Response before it is sent - note that any long running tasks should use the Response.wait method
 * and call Response.done when complete.
 * @event
 */
Template.INSTANCE_READY_EVENT = 'ready';

/**
 * Fired by the Template when it has finished parsing any elements in the template file, the Template is now ready for
 * use and can respond to client requests.
 * @event
 */
Template.TEMPLATE_PREPARED_EVENT = 'initialised';

module.exports = Template;


