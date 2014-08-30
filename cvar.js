"use strict";

var maxId = 0;
var CondVar = module.exports = function (cb) {
    if (!(this instanceof CondVar)) return new CondVar(cb);
    this.inprogress = 0;
    this.completed = false;
    this.onComplete = cb;
    this.id = ++maxId;
}

CondVar.prototype = {};
CondVar.prototype.toString = function () {
    return '[CondVar#'+this.id+']';
}
CondVar.prototype.begin = function () {
    if (this.completed) throw new Error(this+" can't begin a CondVar that's completed");
    ++ this.inprogress;
}
CondVar.prototype.end = function () {
    if (this.completed) throw new Error(this+" can't end a CondVar that's completed");
    if (!this.inprogress) throw new Error(this+" can't end a CondVar without begining it");
    if (! -- this.inprogress) {
        var cvar = this;
        setImmediate(function() {
            if (cvar.inprogress) { cvar = null; return }
            cvar.completed = true;
            cvar.onComplete();
        });
    }
}
