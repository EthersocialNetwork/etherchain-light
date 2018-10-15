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
	var nowcnt = 0;
	var lastaccount = "";
	var createtime = "";
	var contracts = [];
	var contractstransfercount = {};
	client.on("error", function (err) {
		console.log("Error " + err);
	});
	async.waterfall([
			function (callback) {
				client.hget('esn_top100:lastaccount', 'count', function (err, result) {
					return callback(err, result);
				});
			},
			function (pallcnt, callback) {
				if (pallcnt != null && pallcnt != "Nan") {
					allcnt = parseInt(pallcnt);
				}
				client.hget('esn_top100:lastaccount', 'nowcount', function (err, result) {
					return callback(err, result);
				});
			},
			function (pnowcount, callback) {
				if (pnowcount != null && pnowcount != "Nan") {
					nowcnt = parseInt(pnowcount);
				}
				client.hget('esn_top100:lastaccount', 'address', function (err, result) {
					return callback(err, result);
				});
			},
			function (plastaccount, callback) {
				lastaccount = plastaccount;
				client.hget('esn_top100:createtime', 'datetime', function (err, result) {
					return callback(err, result);
				});
			},
			function (pcreatetime, callback) {
				createtime = pcreatetime;
				client.hgetall('esn_contracts:transfercount', function (err, replies) {
					callback(err, replies);
				});
			},
			function (ptransfercount, callback) {
				contractstransfercount = Object.assign({}, ptransfercount);

				client.hgetall('esn_contracts:eventslength', function (err, replies) {
					callback(err, replies);
				});
			},
			function (pcontracts, callback) {
				var contractno = 1;
				for (var hkey in pcontracts) {
					var tmp = {};
					tmp.no = contractno++;
					tmp.address = hkey;
					tmp.eventcount = pcontracts[hkey];
					if (contractstransfercount[hkey]) {
						tmp.transfercount = contractstransfercount[hkey];
					}
					contracts.push(tmp);
				}
				client.zrevrange(redis_args, function (err, result) {
					return callback(err, result);
				});
			},
			function (accounts, callback) {
				//console.dir(contracts);
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
							//if (rank_normal < 5001) {
							tmp = {};
							tmp.address = account;
							tmp.type = "Account";
							//}
							isAccount = false;
						} else {
							let ret = new BigNumber(account);
							data_totalSupply = data_totalSupply.plus(ret);
							//if (rank_normal < 5001) {
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
							//}
							isAccount = true;
						}
						eachCallback();
					});
				}, function (err) {
					callback(err, contracts, lastaccount, allcnt, nowcnt, createtime, data_special, data_normal, (data_totalAccounts.toFormat(0)), (data_totalSupply.toFormat(6) + " ESN"));
				});
			}
		],
		function (err, contracts, lastaccount, totalAccounts, nowAccounts, accounts_create_time, accounts_special, accounts_normal, activeAccounts, totalSupply) {
			var perProgress = ((nowAccounts / totalAccounts) * 100).toLocaleString();
			res.render("top100", {
				"contracts": contracts,
				"lastAccount": lastaccount,
				"totalAccounts": totalAccounts.toLocaleString(),
				"nowAccounts": nowAccounts.toLocaleString(),
				"activeAccounts": activeAccounts,
				"perProgress": perProgress,
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