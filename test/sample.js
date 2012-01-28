/**
 * Not the best way to test the behaviour - but with that much asynchronous behaviour, this will do until something
 * more suitable gets created.
 */

var Templatr = require('../index');

test = (function () {

   "use strict";

   /**
    *
    * @constructor
    * @name
    */
   function test(url, options, tests) {
      this._req = new test.request(url);
      this._res = new test.response();
      this._tests = [].concat(tests);
      this._template = new Templatr(__dirname, 'template.html', options);
      this._template.on(Templatr.TEMPLATE_PREPARED_EVENT, this.onInitialised.bind(this));
      this._template.on(Templatr.INSTANCE_READY_EVENT, this.onTemplateDone.bind(this));
   }

   test.prototype._tests = null;

   test.prototype.onInitialised = function(template) {
      this._template.middleware()(this._req, this._res, function() {});
   };

   test.prototype.onTemplateDone = function(response) {
      var httpRequest = this._req,
          template = this._template,
          document = response.document;

      // console.log(document.innerHTML);

      this._tests.forEach(function(test) {
         if(!test(template, response, document)) {
            console.error('Error!\nTest failed', httpRequest.url, test.toString());
         }
      });

   };

   test.request = function(url) {
      this.url = url;
   };
   test.request.prototype.url = '';

   test.response = function() {
   };
   test.response.prototype._data = null;
   test.response.prototype.send = function(data) {
      this._data = data;
   };

   return test;

}());


new test('/some/path1', Templatr.REMOVE_WHITE_SPACE, [

   // should remove the white space
   function(template, response, document) {
      return !document.innerHTML.match(/>\s+</);
   },

   // should not have merged all of the javascript
   function(template, response, document) {
      return document.getElementsByTagName('script').length === 2;
   }

]);

new test('/some/path2', Templatr.MERGE_SCRIPTS, [

   // should not remove the white space
   function(template, response, document) {
      return !!document.innerHTML.match(/>\s+</);
   },

   // should have merged all of the javascript
   function(template, response, document) {
      return document.getElementsByTagName('script').length === 1;
   }

]);

new test('/some/path3', Templatr.MERGE_SCRIPTS + Templatr.REMOVE_WHITE_SPACE, [

   // should remove the white space
   function(template, response, document) {
      return !document.innerHTML.match(/>\s+</);
   },

   // should have merged all of the javascript
   function(template, response, document) {
      return document.getElementsByTagName('script').length === 1;
   }

]);
