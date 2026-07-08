const rules = require('./webpack.main.rules');

module.exports = {
  entry: './src/main/index.ts',
  module: {
    rules,
  },
  resolve: {
    extensions: ['.js', '.ts', '.json'],
  },
};
