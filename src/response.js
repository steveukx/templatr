
/**
 * The Response object is a wrapper for the window/document that is the result of running a template,
 * this is the object that will be passed ot any listeners when the template is ready, each listener
 * can explicitly tell the response that it should wait for something to happen asynchronously by using
 * the #wait and #done methods, or use the #runScript method to apply either a script or function in
 * the context of the document.
 * 
 * @param {Window} window
 * @param {HTTPResponse} res
 */
function Response(window, res) {
	this.httpResponse = res;
	this.window = window;
	this.document = window.document;
}

/** @type {HTTPResponse} */
Response.prototype.httpResponse = null;

/** @type {Window} */
Response.prototype.window = null;

/** @type {Document} */
Response.prototype.document = null;

/** @type {Number} The number of asynchronous tasks pending */
Response.prototype._waiting = 0;

/**
 * Runs the supplied script against the current document.
 * 
 * $param {Function|String} script
 */
Response.prototype.runScript = function(script) {
	process.nextTick((function() {
	var scriptTag,
		 features = this.document.implementation._features,
		 docElement = this.document.documentElement,
		 implementation = this.document.implementation;

	scriptTag = this.document.createElement('script');
	scriptTag.text = script.toString();
	if(typeof script == 'function') {
		scriptTag.text += '\n' + script.name + '();';
	}

	implementation.addFeature('FetchExternalResources', ['script']);
	implementation.addFeature('ProcessExternalResources', ['script']);
	implementation.addFeature('MutationEvents', ["1.0"]);

	docElement.appendChild(scriptTag);
	docElement.removeChild(scriptTag);

	implementation._features = features;

	this.done();
	}).bind(this));

	this.wait();
};

/**
 * Tells the response that something is waiting to happen - asynchronous scripts use this
 * along with the done method to delay sending the template for any amount of time.
 */
Response.prototype.wait = function() {
	this._waiting++;
};

/**
 * Tells the response that an asynchronous task has completed, when the number of pending
 * tasks reaches zero, the response is sent.
 */
Response.prototype.done = function() {
	if(--this._waiting <= 0) {
		this.send();
	}
};

/**
 * Sends the document to the cached http response - will send whether there are asynchronous tasks
 * still pending or not, used as the callback when the waiting counter reaches zero.
 */
Response.prototype.send = function() {
	this.httpResponse.send(this.window.doctype + this.document.innerHTML);
};

module.exports = Response;

