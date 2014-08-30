"use strict";

var CondVar = module.exports = function (cb) {
    if (!(this instanceof CondVar)) return new CondVar(cb);
    this.inprogress = 0;
    this.completed = false;
    this.onComplete = cb;
}

CondVar.prototype = {};
CondVar.prototype.begin = function () {
    if (this.completed) throw new Error("Can't begin a CondVar that's completed");
    ++ this.inprogress;
}
CondVar.prototype.end = function () {
    if (this.completed) throw new Error("Can't end a CondVar that's completed");
    if (!this.inprogress) throw new Error("Can't end a CondVar without begining it");
    if (! -- this.inprogress) {
        this.completed = true;
        if (this.onComplete) process.nextTick(this.onComplete);
    }
}
