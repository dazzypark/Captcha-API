const { Schema, model } = require("mongoose");

module.exports = model(
  "count",
  new Schema({
    date: String,
    count: Number,
  })
);
