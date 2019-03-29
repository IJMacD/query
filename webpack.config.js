const path = require('path');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin')

module.exports = [{
    entry: [ "@babel/polyfill", "./frontend/combined-query.js" ],
    output: {
        library: "query",
        path: path.resolve(__dirname, 'dist'),
        filename: 'query.js',
    },
    devtool: "source-map",
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: "babel-loader"
                }
            }
        ]
    },
    plugins: [
      // Ignore all locale files of moment.js
      new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),
      new webpack.DefinePlugin({
            'process.env': {
                APP_ENV: JSON.stringify("browser"),
            },
      }),
    ],
},{
    entry: "./frontend/main.js",
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'main.js',
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: "babel-loader"
                }
            }
        ]
    },
    plugins: [
        new CopyWebpackPlugin(["static"]),
    ],
}];