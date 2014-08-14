"use strict";

var CondVar = module.exports = function (cb) {
    if (!(this instanceof CondVar)) return new CondVar();
    this.depth = 0;
    this.completed = false;
    this.onComplete = cb;
}

CondVar.prototype = {};
CondVar.prototype.begin = function () {
    if (this.completed) throw new Error("Can't begin a CondVar that's completed");
    ++ this.depth;
}
CondVar.prototype.end = function () {
    if (this.completed) throw new Error("Can't end a CondVar that's completed");
    if (!this.depth) throw new Error("Can't end a CondVar without begining it");
    if (! -- this.depth) {
        this.completed = true;
        if (this.onComplete) process.nextTick(this.onComplete);
    }
}
CondVar.prototype.complete = function (cb) {
    if (this.completed) return process.nextTick(cb);
    this.onComplete = cb;
}
