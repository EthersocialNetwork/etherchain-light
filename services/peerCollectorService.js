const async = require('async');
const Web3 = require('web3');
const redis = require("redis");
const geoip = require('geoip-lite');
const iso = require('iso-3166-1');
const tcpPortUsed = require('tcp-port-used');
const pre_fix = 'explorerPeers:';
var client = redis.createClient();
client.on("error", function (err) {
	console.log("Error " + err);
});

function getRedis() {
	if (client && client.connected) {
		return client;
	}

	if (client) {
		client.end(); // End and open once more
	}

	client = redis.createClient();
	client.on("error", function (err) {
		console.log("Error " + err);
	});
	return client;
}

var peercollector = function (config) {
	async.forever(
		function (next) {
			console.log("[▷▷▷ Start ▷▷▷][peerCollectorService]", printDateTime());
			var web3 = new Web3();
			web3.setProvider(config.providerIpc);
			var data = {};
			data.peers = [];
			async.waterfall([
				function (callback) {
					web3.parity.netPeers(function (err, result) {
						if (result) {
							callback(null, result.peers);
						} else {
							callback(err, null);
						}
					});
				},
				function (peers, callback) {
					if (!peers) {
						callback(null);
					} else {
						peers.slice(0).forEach(function (element) {
							if (element.network.remoteAddress == 'Handshake') {
								peers.splice(peers.indexOf(element), 1);
							}
						});
						peers.forEach(element => {
							var rres = element.network.remoteAddress.split(":");
							element.ip = rres[0];
							if (rres.length > 1) {
								element.port = rres[1];
							} else {
								element.port = "undefined";
							}
						});
						peers = peers.sort((a, b) => {
							if (!b.port) {
								return -1;
							}
							if (!a.port) {
								return 1;
							}

							if (parseInt(a.port, 10) == 50505) {
								return -1;
							}
							if (parseInt(b.port, 10) == 50505) {
								return 1;
							}

							if (parseInt(a.port, 10) < parseInt(b.port, 10)) {
								return 1;
							}
							if (parseInt(a.port, 10) > parseInt(b.port, 10)) {
								return -1;
							}
							return 0;
						});

						var existAddress = [];
						async.eachSeries(peers, function (peer, eachCallback) {
							if (peer.ip == '115.68.110.213') {
								eachCallback();
							} else {
								const time_now = new Date();
								const scan_time = printDateTime(time_now);
								const scan_msTime = time_now.getTime();
								var tmp_data = {};
								//id, name, remoteAddress
								//console.log("peer: " + peer.id, peer.name, peer.remoteAddress, peer.scantime);
								tmp_data.ip = peer.ip;
								tmp_data.port = peer.port;
								tmp_data.id = peer.id;
								tmp_data.name = peer.name; //Gesn/v0.3.2-unstable-8f84614d/linux-amd64/go1.9.4 //exe, ver, os, gover
								if (!peer.name || peer.name.length < 1) {
									eachCallback();
								} else if (!peer.protocols.eth || !peer.protocols.eth.head || peer.protocols.eth.head.length < 1) {
									eachCallback();
								} else {
									if (peer.name.length > 2) {
										var sres = peer.name.split("/");
										if (sres.length > 4)
											sres.splice(1, 1);
										tmp_data.exe = sres[0];
										if (sres.length > 1) {
											var sres_ver = sres[1].split("-");
											if (sres_ver.length > 1)
												tmp_data.ver = sres_ver[0] + "-" + sres_ver[1];
											else
												tmp_data.ver = sres_ver[0];
										}
										if (sres.length > 2)
											tmp_data.os = sres[2];
										if (sres.length > 3)
											tmp_data.gover = sres[3];
									}

									if (tmp_data.ip && tmp_data.ip.split(".").length > 2 && tmp_data.id && tmp_data.id.length > 10) {
										var s = tmp_data.id;
										var h = 0,
											l = s.length,
											i = 0;
										if (l > 0) {
											while (i < l) {
												h = (h << 5) - h + s.charCodeAt(i++) | 0;
											}
										}

										var txt_geo;
										var geo = geoip.lookup(tmp_data.ip); //node ./node_modules/geoip-lite/scripts/updatedb.js
										if (!geo) {
											//console.log("if (!geo) { : ", tmp_data);
											txt_geo = "local area network".concat(", ", "LAN");
											return eachCallback();
										} else {
											if (!geo.city || geo.city.length < 2) {
												geo.city = "unknown";
											}
											txt_geo = String(geo.city).concat(", ", geo.country);
										}

										if (tmp_data.port == config.networkPortString || existAddress.includes(tmp_data.ip)) {
											var enode = "enode://";
											enode = enode.concat(tmp_data.id, "@", tmp_data.ip, ":", tmp_data.port);

											var rds_value = {
												id: tmp_data.id,
												exe: tmp_data.exe,
												ver: tmp_data.ver,
												os: tmp_data.os,
												gover: tmp_data.gover,
												ip: tmp_data.ip,
												port: tmp_data.port,
												scantime: scan_time,
												enode: enode,
												name: tmp_data.name,
												scanmstime: scan_msTime,
												geo: txt_geo
											};
											var rds_key = pre_fix.concat(h);
											getRedis().hmset(rds_key, rds_value);
											var rds_key2 = pre_fix.concat("list");
											getRedis().hset(rds_key2, h, tmp_data.id);
											if (!existAddress.includes(tmp_data.ip)) {
												existAddress.push(tmp_data.ip);
											}
											eachCallback();
										} else {
											var inUse = true; // wait until the port is in use
											tcpPortUsed.waitForStatus(config.networkPortNumber, tmp_data.ip, inUse, 200, 400)
												.then(function () {
													//console.log("tcpPortUsed.waitForStatus:", config.networkPortString, tmp_data.ip, "\n", inUse);
													tmp_data.orgPort = tmp_data.port;
													tmp_data.port = config.networkPortString;
													var enode = "enode://";
													enode = enode.concat(tmp_data.id, "@", tmp_data.ip, ":", tmp_data.port);
													var rds_value = {
														id: tmp_data.id,
														exe: tmp_data.exe,
														ver: tmp_data.ver,
														os: tmp_data.os,
														gover: tmp_data.gover,
														ip: tmp_data.ip,
														port: tmp_data.port,
														orgPort: tmp_data.orgPort,
														scantime: scan_time,
														enode: enode,
														name: tmp_data.name,
														scanmstime: scan_msTime,
														geo: txt_geo
													};
													var rds_key = pre_fix.concat(h);
													getRedis().hmset(rds_key, rds_value);
													var rds_key2 = pre_fix.concat("list");
													getRedis().hset(rds_key2, h, tmp_data.id);
													if (!existAddress.includes(tmp_data.ip)) {
														existAddress.push(tmp_data.ip);
													}
													eachCallback();
												}, function (err) {
													if (err) {
														//console.log("tcpPortUsed.waitForStatus Error:", config.networkPortString, tmp_data.ip, "\n", err);
														var enode = "enode://";
														enode = enode.concat(tmp_data.id, "@", tmp_data.ip, ":", tmp_data.port);
														var rds_value = {
															id: tmp_data.id,
															exe: tmp_data.exe,
															ver: tmp_data.ver,
															os: tmp_data.os,
															gover: tmp_data.gover,
															ip: tmp_data.ip,
															port: tmp_data.port,
															scantime: scan_time,
															enode: enode,
															name: tmp_data.name,
															scanmstime: scan_msTime,
															geo: txt_geo
														};
														var rds_key = pre_fix.concat(h);
														getRedis().hmset(rds_key, rds_value);
														var rds_key2 = pre_fix.concat("list");
														getRedis().hset(rds_key2, h, tmp_data.id);
														if (!existAddress.includes(tmp_data.ip)) {
															existAddress.push(tmp_data.ip);
														}
													}
													eachCallback();
												});
										}
									} else {
										eachCallback();
									}
								}
							}
						}, function (err) {
							callback(err);
						});
					}
				}
			], function (err) {
				if (err) {
					console.log("Error " + err);
				}
				console.log("[□□□□ End □□□□][peerCollectorService]", printDateTime());
				setTimeout(function () {
					next();
				}, config.peerCollectorServiceInterval);
			});
		},
		function (err) {
			console.log('!!!! peerCollectorService STOP !!!!', err);
		}
	);
};

module.exports = peercollector;

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

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}