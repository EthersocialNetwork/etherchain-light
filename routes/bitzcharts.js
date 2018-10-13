var express = require('express');
var router = express.Router();
var async = require('async');
var https = require('https');

router.get('/:offset?', function (req, res, next) {
	var config = req.app.get('config');
	var data = {};
	data.startTime = new Date();

	async.waterfall([
			function (callback) {
				var url = 'https://api.bit-z.com/api_v1/kline?coin=esn_btc&type=15m';
				https.get(url, function (res) {
					var body = '';
					res.on('data', function (chunk) {
						body += chunk;
					});
					res.on('end', function () {
						var fbResponse = JSON.parse(body);
						console.dir(fbResponse.data.datas.data);
						return callback(null, fbResponse.data.datas.data);
					});
				}).on('error', function (e) {
					console.log("Got an error: ", e);
					return callback(e, null);
				});
			}
		],
		function (err, resData) {
			res.render("bitzcharts", {
				"chartdata": resData
			});
		});
});

module.exports = router;