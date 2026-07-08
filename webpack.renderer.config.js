const rules = require('./webpack.renderer.rules');

module.exports = {
  module: {
    rules,
  },
  resolve: {
    extensions: ['.js', '.ts', '.tsx', '.css', '.json'],
  },
};
