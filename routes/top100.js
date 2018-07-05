var express = require('express');
var router = express.Router();
var BigNumber = require('bignumber.js');

var async = require('async');
var redis = require("redis"),
	client = redis.createClient();
var max = 0, min = -1;
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
			var data_special = [];
			var data_normal = [];
			var create_time = "";
			var rank_normal = 0;
			var rank_special = 1;
			let data_totalAccounts = new BigNumber(0);
			let data_totalSupply = new BigNumber(0);
			var isAccount = true;
			var tmp = {};

			async.eachSeries(accounts, function(account, eachCallback) {
				//console.log("account: " + account, "rank_normal: " + rank_normal);
				async.setImmediate(function() {
					if(rank_normal === 0) {
						create_time = account;
						rank_normal++;
					} else if (account == "2100000000"){
						var tmpVar = account;
						console.log("tmpVar: " + tmpVar);
					} else {
						if(isAccount){
							data_totalAccounts = data_totalAccounts.plus(1);
							//if(rank_normal < 501) {
								tmp = {};
								tmp.address = account;
								tmp.type = "Account";
							//}
							isAccount = false; 
						} else {
							console.log("pre_ret: " + account);
							let ret = new BigNumber(account);
							data_totalSupply = data_totalSupply.plus(ret);
							//if(rank_normal < 501) {
								tmp.balance = ret.toFormat(6) + " ESN";
								if (config.names[tmp.address]) {
									tmp.rank = "Rank " + rank_special++;
									data_special.push(tmp);
								} else {
									tmp.rank = "Rank " + rank_normal++;
									data_normal.push(tmp);
								}
							//}
							isAccount = true; 
						}
					}
					eachCallback();
				});
			}, function(err) {
				callback(err, create_time, data_special, data_normal, (data_totalAccounts.toFormat(0)), (data_totalSupply.toFormat(6) + " ESN"));
			});
		}
	],
	function(err, accounts_create_time, accounts_special, accounts_normal, totalAccounts, totalSupply) {
		res.render("top100", { "totalAccounts": totalAccounts, "totalSupply": totalSupply, "accounts_create_time": accounts_create_time, "accounts_special": accounts_special, "accounts_normal": accounts_normal });
	});
});

module.exports = router;

