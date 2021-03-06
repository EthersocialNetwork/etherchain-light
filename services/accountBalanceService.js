const BigNumber = require('bignumber.js');
const async = require('async');
const Web3 = require('web3');

const configConstant = require('../config/configConstant');
var Redis = require('ioredis');
var redis = new Redis(configConstant.redisConnectString);

const finalRdsKey = 'esn_top100';
const readyRdsKey = 'ready_esn_top100';

var accountblanceschecker = function (config, configERC20, app) {
	async.forever(
		function (next) {
			console.log("[▷▷▷ Start ▷▷▷][accountBalanceService]", printDateTime());
			var web3 = new Web3();
			web3.setProvider(new web3.providers.HttpProvider(configConstant.localRPCaddress));
			var Ether = new BigNumber(10e+17);
			var data = "";
			var cnt = 0;
			var allcnt = 0;
			var nowcnt = 0;
			var isSetTotal = false;
			var tokenExporter = app.get('tokenExporter');

			async.waterfall([
				function (callback) {
					redis.hget(finalRdsKey.concat(':lastaccount'), 'nowcount', function (err, result) {
						return callback(err, result);
					});
				},
				function (pnowcnt, callback) {
					if (pnowcnt != null && pnowcnt != "Nan") {
						nowcnt = parseInt(pnowcnt);
					}
					redis.hget(finalRdsKey.concat(':lastaccount'), 'count', function (err, result) {
						return callback(err, result);
					});
				},
				function (pallcnt, callback) {
					if (pallcnt != null && pallcnt != "Nan") {
						allcnt = parseInt(pallcnt);
					}
					redis.hget(finalRdsKey.concat(':lastaccount'), 'address', function (err, result) {
						return callback(err, result);
					});
				},
				function (lastaccount, callback) {
					//console.log(finalRdsKey.concat(':lastaccount:'), lastaccount);
					web3.parity.listAccounts(5000, lastaccount, function (err, result) {
						callback(err, result);
					});
				},
				function (accounts, callback) {
					if (!accounts) {
						callback({
							name: "FatDBDisabled",
							message: "Parity FatDB system is not enabled. Please restart Parity with the --fat-db=on parameter."
						});
					} else {
						if (accounts.length < 1) {
							nowcnt = 0;
							isSetTotal = true;
							web3.parity.listAccounts(10000, null, function (err, result) {
								callback(err, result);
							});
						} else {
							callback(null, accounts);
						}
					}
				},
				function (accounts, callback) { //balance batch 시작
					var batch = web3.createBatch();
					async.eachSeries(accounts, function (account, batchAddEachCallback) {
						batch.add(web3.eth.getBalance.request(account));
						batchAddEachCallback();
					}, function (err) {
						callback(err, batch);
					});
				},
				function (batchAdded, callback) {
					batchAdded.requestManager.sendBatch(batchAdded.requests, function (err, results) {
						if (err) {
							callback(err, null);
						} else {
							callback(null, batchAdded.requests, results);
						}
					});
				},
				function (requests, balances, callback) {
					var accountBalances = {};
					async.eachOfSeries(requests, function (value, key, requestsEachCallback) {
						accountBalances[value.params[0]] = balances[key].result;
						requestsEachCallback();
					}, function (err) {
						if (err) {
							console.log("[ERROR] batchResults: ", err);
						}
						callback(null, accountBalances);
					});
				}, //balance batch 종료

				function (accountBalances, callback) {
					var batch = web3.createBatch();
					async.eachSeries(Object.keys(accountBalances), function (account, batchAddEachCallback) {
						batch.add(web3.eth.getCode.request(account));
						batchAddEachCallback();
					}, function (err) {
						callback(err, batch, accountBalances);
					});
				},
				function (batchAdded, accountBalances, callback) {
					batchAdded.requestManager.sendBatch(batchAdded.requests, function (err, results) {
						if (err) {
							callback(err, null);
						} else {
							callback(null, batchAdded.requests, results, accountBalances);
						}
					});
				},
				function (requests, codes, accountBalances, callback) {
					var accountsCodes = [];
					async.eachOfSeries(requests, function (value, key, requestsEachCallback) {
						var tmpAccountCode = {};
						tmpAccountCode.account = value.params[0];
						tmpAccountCode.code = codes[key].result;
						tmpAccountCode.balance = accountBalances[value.params[0]];
						accountsCodes.push(tmpAccountCode);
						requestsEachCallback();
					}, function (err) {
						if (err) {
							console.log("[ERROR] batchResults: ", err);
						}
						callback(null, accountsCodes);
					});
				},
				function (accountsCodes, callback) {
					async.eachSeries(accountsCodes, function (accountCode, eachCallback) {
						//console.log("[Top100]", accountCode.account, accountCode.code.substr(0, 10), accountCode.balance);
						data = accountCode.account;
						if (accountCode.code !== "0x" && !tokenExporter[accountCode.account]) {
							var tokenExporterService = require('../services/tokenExporter.js');
							tokenExporter[accountCode.account] = new tokenExporterService(config.providerIpc, configERC20.erc20ABI, accountCode.account, 1, 10);
							app.set('tokenExporter', tokenExporter);
						}

						if (accountCode.code !== "0x" && tokenExporter[accountCode.account]) {
							var allEvents = tokenExporter[accountCode.account].contract.allEvents({
								fromBlock: 0,
								toBlock: "latest"
							});
							if (allEvents) {
								allEvents.get(function (err, events) {
									if (err) {
										console.log("Error receiving historical events:", err);
										eachCallback(err);
									} else {
										redis.hset('esn_contracts:eventslength', accountCode.account, events.length);
										var transfercount = 0;
										async.eachSeries(events, function (event, contracteachCallback) {
											if (event.blockNumber && (event.event === "Transfer" || event.event === "Approval")) {
												transfercount++;
											}
											redis.hset('esn_contracts:transfercount', accountCode.account, transfercount);
											contracteachCallback();
										}, function (err) {
											eachCallback();
										});
									}
								});
							} else {
								eachCallback();
							}
						} else {
							var numBalance = new BigNumber(accountCode.balance);
							numBalance = numBalance.dividedBy(Ether);
							nowcnt++;
							if (numBalance >= 0.00000001) {
								cnt++;
								redis.zadd(finalRdsKey, numBalance.toString(), accountCode.account);
							} else {
								redis.zrem(finalRdsKey, accountCode.account);
							}
							eachCallback();
						}
					}, function (err) {
						callback(err, "완료 시간: " + printDateTime(), data, cnt, allcnt, nowcnt);
					});
				}
			], function (err, printdatetime, resaccount, rescount, resallcount, nowcount) {
				if (err) {
					console.log("[□□□ Error □□□][accountBalanceService] ", err);
				} else {
					redis.hset(finalRdsKey.concat(':createtime'), 'datetime', printDateTime());
					if (resallcount < nowcount) {
						redis.hset(finalRdsKey.concat(':lastaccount'), 'count', nowcount);
					}
					redis.hset(finalRdsKey.concat(':lastaccount'), 'nowcount', nowcount);
					if (resaccount != "") {
						redis.hset(finalRdsKey.concat(':lastaccount'), 'address', resaccount);
					}

					let totalAccounts = new BigNumber(0);
					let totalSupply = new BigNumber(0);
					if (isSetTotal) {
						var max = 0,
							min = -1;
						var redis_args = [finalRdsKey, max, min, 'WITHSCORES'];

						async.waterfall([
								function (apicallback) {
									redis.hget(finalRdsKey.concat(':lastaccount'), 'count', function (err, result) {
										return apicallback(err, result);
									});
								},
								function (allcnt, apicallback) {
									redis.zrevrange(redis_args, function (err, result) {
										return apicallback(err, allcnt, result);
									});
								},
								function (allcnt, accounts, apicallback) {
									var isAccount = true;

									async.eachSeries(accounts, function (account, apieachCallback) {
										async.setImmediate(function () {
											if (isAccount) {
												totalAccounts = totalAccounts.plus(1);
												isAccount = false;
											} else {
												let ret = new BigNumber(account);
												totalSupply = totalSupply.plus(ret);
												isAccount = true;
											}
											apieachCallback();
										});
									}, function (err) {
										apicallback(err, allcnt, totalAccounts.toNumber(), totalSupply.toNumber());
									});
								}
							],
							function (err, totalAccounts, activeAccounts, totalSupply) {
								if (err) {
									console.log('!!!! accountBalanceService Error !!!!', err);
								} else {
									redis.hset(finalRdsKey.concat(':apisupport'), 'totalAccounts', totalAccounts);
									redis.hset(finalRdsKey.concat(':apisupport'), 'activeAccounts', activeAccounts);
									redis.hset(finalRdsKey.concat(':apisupport'), 'totalSupply', totalSupply);
								}
							});
					}
					console.log("[□□□□ End □□□□][accountBalanceService]", printDateTime(), nowcnt, "/", allcnt, "[", ((nowcnt / allcnt) * 100).toLocaleString(), "% ]");
				}
				setTimeout(function () {
					next();
				}, configConstant.accountBalanceServiceInterval);
			});
		},
		function (err) {
			console.log('!!!! accountBalanceService STOP !!!!', err);
		}
	);
};

module.exports = accountblanceschecker;

function addZeros(num, digit) {
	var zero = '';
	num = num.toString();
	if (num.length < digit) {
		for (i = 0; i < digit - num.length; i++) {
			zero += '0';
		}
	}
	return zero + num.toString();
}

function printDateTime() {
	var currentDate = new Date();
	var calendar = currentDate.getFullYear() + "-" + addZeros((currentDate.getMonth() + 1).toString(), 2) + "-" + addZeros(currentDate.getDate().toString(), 2);
	var currentHours = addZeros(currentDate.getHours(), 2);
	var currentMinute = addZeros(currentDate.getMinutes(), 2);
	var currentSeconds = addZeros(currentDate.getSeconds(), 2);
	return calendar + " " + currentHours + ":" + currentMinute + ":" + currentSeconds;
}