var express = require('express');
var router = express.Router();
var BigNumber = require('bignumber.js');

var async = require('async');
var redis = require("redis"),
	client = redis.createClient();
var max = 0,
	min = -1;
var redis_args = ['esn_top100', max, min, 'WITHSCORES'];

router.get('/:offset?', function (req, res, next) {
	var config = req.app.get('config');
	var allcnt = 0;
	var lastaccount = "";
	client.on("error", function (err) {
		console.log("Error " + err);
	});
	async.waterfall([
			function (callback) {
				client.hget('esn_top100:lastaccount', 'count', function (err, result) {
					if (result != null && result != "Nan") {
						allcnt = parseInt(result);
					}
					callback(err);
				});
			},
			function (callback) {
				client.hget('esn_top100:lastaccount', 'address', function (err, result) {
					lastaccount = result;
					callback(err);
				});
			},
			function (callback) {
				client.hget('esn_top100:createtime', 'datetime', function (err, result) {
					callback(err, result);
				});
			},
			function (createtime, callback) {
				client.zrevrange(redis_args, function (err, result) {
					callback(err, result, createtime);
				});
			},
			function (accounts, create_time, callback) {
				var data_special = [];
				var data_normal = [];
				var rank_normal = 1;
				var rank_special = 1;
				let data_totalAccounts = new BigNumber(0);
				let data_totalSupply = new BigNumber(0);
				var isAccount = true;
				var tmp = {};

				async.eachSeries(accounts, function (account, eachCallback) {
					async.setImmediate(function () {
						if (isAccount) {
							data_totalAccounts = data_totalAccounts.plus(1);
							if (rank_normal < 5001) {
								tmp = {};
								tmp.address = account;
								tmp.type = "Account";
							}
							isAccount = false;
						} else {
							let ret = new BigNumber(account);
							data_totalSupply = data_totalSupply.plus(ret);
							if (rank_normal < 5001) {
								tmp.balance = ret.toFormat(8) + " ESN";
								const name = config.names[tmp.address];
								if (name && name != "ESN Alpha or Beta Testers") {
									tmp.rank = "Rank " + rank_special++;
									data_special.push(tmp);
								} else {
									if (name == "ESN Alpha or Beta Testers") {
										tmp.address_name = "ESN Alpha or Beta Testers";
									}
									tmp.rank = "Rank " + rank_normal++;
									data_normal.push(tmp);
									tmp = null;
								}
							}
							isAccount = true;
						}
						eachCallback();
					});
				}, function (err) {
					callback(err, lastaccount, (allcnt.toLocaleString()), create_time, data_special, data_normal, (data_totalAccounts.toFormat(0)), (data_totalSupply.toFormat(6) + " ESN"));
				});
			}
		],
		function (err, lastaccount, totalAccounts, accounts_create_time, accounts_special, accounts_normal, activeAccounts, totalSupply) {
			res.render("top100", {
				"lastAccount": lastaccount,
				"totalAccounts": totalAccounts,
				"activeAccounts": activeAccounts,
				"totalSupply": totalSupply,
				"accounts_create_time": accounts_create_time,
				"accounts_special": accounts_special,
				"accounts_normal": accounts_normal
			});
			accounts_special = null;
			accounts_normal = null;
		});
});

module.exports = router;