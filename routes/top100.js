var express = require('express');
var router = express.Router();
var BigNumber = require('bignumber.js');

var async = require('async');

const configConstant = require('../config/configConstant');
var Redis = require('ioredis');
var redis = new Redis(configConstant.redisConnectString);

var max = 0,
	min = -1;
var redis_args = ['esn_top100', max, min, 'WITHSCORES'];
const finalRdsKey = 'esn_top100';
const readyRdsKey = 'ready_esn_top100';

router.get('/:json?', function (req, res, next) {
	var configNames = req.app.get('configNames');
	var allcnt = 0;
	var nowcnt = 0;
	var lastaccount = "";
	var createtime = "";
	var contracts = [];
	var contractstransfercount = {};
	var tokenExporter = req.app.get('tokenExporter');
	async.waterfall([
			function (callback) {
				redis.hget('esn_top100:lastaccount', 'count', function (err, result) {
					return callback(err, result);
				});
			},
			function (pallcnt, callback) {
				if (pallcnt != null && pallcnt != "Nan") {
					allcnt = parseInt(pallcnt);
				}
				redis.hget('esn_top100:lastaccount', 'nowcount', function (err, result) {
					return callback(err, result);
				});
			},
			function (pnowcount, callback) {
				if (pnowcount != null && pnowcount != "Nan") {
					nowcnt = parseInt(pnowcount);
				}
				redis.hget('esn_top100:lastaccount', 'address', function (err, result) {
					return callback(err, result);
				});
			},
			function (plastaccount, callback) {
				lastaccount = plastaccount;
				redis.hget('esn_top100:createtime', 'datetime', function (err, result) {
					return callback(err, result);
				});
			},
			function (pcreatetime, callback) {
				createtime = pcreatetime;
				redis.hgetall('esn_contracts:transfercount', function (err, replies) {
					callback(err, replies);
				});
			},
			function (ptransfercount, callback) {
				contractstransfercount = Object.assign({}, ptransfercount);

				redis.hgetall('esn_contracts:eventslength', function (err, replies) {
					callback(err, replies);
				});
			},
			function (pcontracts, callback) {
				var sortable = [];
				for (var contractkey in pcontracts) {
					sortable.push([contractkey, pcontracts[contractkey]]);
				}
				sortable.sort(function (a, b) {
					return Number(b[1]) - Number(a[1]);
				});
				var contractno = 1;
				sortable.forEach(function (tokeninfo) {
					if (tokeninfo[0] && tokenExporter[tokeninfo[0]]) {
						var tmpTokeninfo = {};
						tmpTokeninfo.no = contractno++;
						tmpTokeninfo.address = tokeninfo[0];
						tmpTokeninfo.eventcount = tokeninfo[1];
						tmpTokeninfo.transfercount = 0;
						if (contractstransfercount[tokeninfo[0]]) {
							tmpTokeninfo.transfercount = contractstransfercount[tokeninfo[0]];
						}

						tmpTokeninfo.name = "";
						if (tokenExporter[tokeninfo[0]] && tokenExporter[tokeninfo[0]].token_name) {
							tmpTokeninfo.name = tokenExporter[tokeninfo[0]].token_name;
						}

						tmpTokeninfo.decimals = "";
						if (tokenExporter[tokeninfo[0]] && tokenExporter[tokeninfo[0]].token_decimals) {
							tmpTokeninfo.decimals = tokenExporter[tokeninfo[0]].token_decimals;
						}

						tmpTokeninfo.symbol = "";
						if (tokenExporter[tokeninfo[0]] && tokenExporter[tokeninfo[0]].token_symbol) {
							tmpTokeninfo.symbol = tokenExporter[tokeninfo[0]].token_symbol;
						}

						tmpTokeninfo.totalSupply = "";
						if (tokenExporter[tokeninfo[0]] && tokenExporter[tokeninfo[0]].token_totalSupply) {
							tmpTokeninfo.totalSupply = tokenExporter[tokeninfo[0]].token_totalSupply;
						}
						contracts.push(tmpTokeninfo);
					}
				});
				return callback(null);
			},
			function (callback) {
				redis.hget(finalRdsKey.concat(':apisupport'), 'activeAccounts', function (err, result) {
					return callback(err, result);
				});
			},
			function (activeAccounts, callback) {
				redis.hget(finalRdsKey.concat(':apisupport'), 'totalSupply', function (err, result) {
					return callback(err, activeAccounts, result);
				});
			},
			function (activeAccounts, totalSupply, callback) {
				redis.zrevrange(redis_args, function (err, result) {
					return callback(err, activeAccounts, totalSupply, result);
				});
			},
			function (activeAccounts, totalSupply, accounts, callback) {
				var data_special = [];
				var data_normal = [];
				var rank_normal = 1;
				var rank_special = 1;
				let data_totalAccounts = new BigNumber(activeAccounts);
				let data_totalSupply = new BigNumber(totalSupply);
				let data_specialSupply = new BigNumber(0);
				let data_normalSupply = new BigNumber(0);
				var isAccount = true;
				var tmp = {};

				async.eachSeries(accounts, function (account, eachCallback) {
					async.setImmediate(function () {
						if (isAccount) {
							tmp = {};
							tmp.address = account;
							tmp.type = "Account";
							isAccount = false;
						} else {
							let ret = new BigNumber(account);
							tmp.balance = ret.toFormat(8) + " ESN";
							const name = configNames.names[tmp.address];
							const holdname = configNames.holdnames[tmp.address];
							if (holdname) {
								tmp.address_name = holdname;
								data_specialSupply = data_specialSupply.plus(ret);
								tmp.rank = "Rank " + rank_special++;
								data_special.push(tmp);
							} else {
								if (name) {
									tmp.address_name = name;
								}
								tmp.rank = "Rank " + rank_normal++;
								data_normal.push(tmp);
								tmp = null;
							}
							isAccount = true;
						}
						eachCallback();
					});
				}, function (err) {
					data_normalSupply = data_totalSupply.minus(data_specialSupply);
					callback(err, contracts, lastaccount, allcnt, nowcnt, createtime, data_special, data_normal, (data_totalAccounts.toFormat(0)), (data_totalSupply.toFormat(6) + " ESN"), (data_specialSupply.toFormat(6) + " ESN"), (data_normalSupply.toFormat(6) + " ESN"));
				});
			}
		],
		function (err, contracts, lastaccount, totalAccounts, nowAccounts, accounts_create_time, accounts_special, accounts_normal, activeAccounts, totalSupply, specialSupply, normalSupply) {
			if (err) {
				console.log("Error ", err);
				return next(err);
			}
			var perProgress = ((nowAccounts / totalAccounts) * 100).toLocaleString();
			if (req.params.json && (req.params.json == 'true' || req.params.json == 'json')) {
				var jsonData = {};
				jsonData.activeAccounts = activeAccounts;
				jsonData.totalAccounts = totalAccounts;
				jsonData.contracts = contracts;
				jsonData.accounts_normal = accounts_normal;
				jsonData.accounts_special = accounts_special;
				res.json(resultToJson(err, jsonData));
			}
			if (req.params.json && req.params.json == 'summary') {
				var jsonSummary = {};
				jsonSummary.TotalNumberOfAccounts = totalAccounts;
				jsonSummary.ActiveNumberOfAccounts = activeAccounts;
				jsonSummary.TotalSupply = totalSupply;
				jsonSummary.LongTermHoldingAmount = specialSupply;
				jsonSummary.CirculatingSupply = normalSupply;
				res.json(resultToJson(err, jsonSummary));
			} else {
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
					"accounts_normal": accounts_normal,
					"specialSupply": specialSupply,
					"normalSupply": normalSupply
				});
			}
		});
});

function resultToJson(err, param) {
	var result = {};
	result.jsonrpc = 'esn';
	result.success = false;

	if (err) {
		result.result = err;
	} else if (param) {
		result.result = param;
		result.success = true;
	} else {
		result.result = NaN;
	}
	return result;
}
module.exports = router;