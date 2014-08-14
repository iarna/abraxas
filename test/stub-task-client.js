"use strict";

module.exports = function (callback,options) {
    return {
        options: options,
        callback: callback,
        prepareBody: function (data,todo) { todo(data) },
        acceptResult: function(body) {
            this.result = body;
        },
        acceptError: function (error) {
            this.error = error;
        }
    }
}
