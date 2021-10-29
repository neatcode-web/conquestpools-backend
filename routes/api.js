var express = require("express");
var authRouter = require("./auth");
var orderRouter = require("./order");

var app = express();

app.use("/auth/", authRouter);
app.use("/order/", orderRouter);

module.exports = app;