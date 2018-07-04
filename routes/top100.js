var express = require('express');
var router = express.Router();
var BigNumber = require('bignumber.js');

var async = require('async');
var redis = require("redis"),
	client = redis.createClient();
var max = 0, min = 1000;
var redis_args = [ 'esn', max, min, 'WITHSCORES' ];

router.get('/:offset?', function(req, res, next) {
	var config = req.app.get('config');

	client.on("error", function (err) {
		console.log("Error " + err);
	});

	async.waterfall([
		function(callback) {
			client.zrevrange(redis_args, function(err, result) {
				callback(err, result);
			});
		}, 
		function(accounts, callback) {
			var data = {};
			var idx = 0;
			async.eachSeries(accounts, function(account, eachCallback) {
				if(idx < (min*2)) {
					data[accounts[idx]] = {};
					data[accounts[idx]].address = accounts[idx];
					data[accounts[idx]].type = "Account";
					var ret = new BigNumber(accounts[idx+1]);
					data[accounts[idx]].balance = ret.toFormat(6) + " ESN";;
					data[accounts[idx]].rank = "Rank " + (idx/2+1);
					idx = idx + 2;
				}
				eachCallback();
			}, function(err) {
				callback(err, data);
			});
		}
	], 
	function(err, accounts) {
		res.render("top100", { "accounts": accounts });
	});
});

module.exports = router;

