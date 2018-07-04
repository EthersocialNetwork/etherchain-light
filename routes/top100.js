var express = require('express');
var router = express.Router();
var BigNumber = require('bignumber.js');

var async = require('async');
var redis = require("redis"),
	client = redis.createClient();
var max = 0, min = 1000;
var redis_args = [ 'esn_top100', max, min, 'WITHSCORES' ];

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
			var data_special = {};
			var data_normal = {};
			var create_time = "";
			var idx = 0;
			var rank_normal = 0;
			var rank_special = 1;
			async.eachSeries(accounts, function(account, eachCallback) {
				if(rank_normal === 0)	{
					create_time = accounts[idx];
					idx = idx + 2;
					rank_normal++
				}
				if(rank_normal < 501)	{
					if (config.names[accounts[idx]]) {
						data_special[accounts[idx]] = {};
						data_special[accounts[idx]].address = accounts[idx];
						data_special[accounts[idx]].type = "Account";
						var ret = new BigNumber(accounts[idx+1]);
						data_special[accounts[idx]].balance = ret.toFormat(6) + " ESN";;
						data_special[accounts[idx]].rank = "Rank " + rank_special++;
					} else {
						data_normal[accounts[idx]] = {};
						data_normal[accounts[idx]].address = accounts[idx];
						data_normal[accounts[idx]].type = "Account";
						var ret = new BigNumber(accounts[idx+1]);
						data_normal[accounts[idx]].balance = ret.toFormat(6) + " ESN";;
						data_normal[accounts[idx]].rank = "Rank " + rank_normal++;
					}
					idx = idx + 2;
				}
				eachCallback();
			}, function(err) {
				callback(err, create_time, data_special, data_normal);
			});
		}
	], 
	function(err, accounts_create_time, accounts_special, accounts_normal) {
		res.render("top100", { "accounts_create_time": accounts_create_time, "accounts_special": accounts_special, "accounts_normal": accounts_normal });
	});
});

module.exports = router;

