const async = require('async');
const tcpPortUsed = require('tcp-port-used');
const redis = require("redis");

var checker = function (address, config) {
  var self = this;
  self.address = address;

  var sres = address.split("/");
  if (sres[2]) {
    var sreses = sres[2].split(":");
    if (sreses.length == 2) {
      self.ip = sreses[0];
      self.port = parseInt(sreses[1], 10);
    }
  }
  self.prevTime = new Date();
  async.forever(
    function (next) {
      const client = redis.createClient();
      client.on("error", function (err) {
        console.log("Error " + err);
      });

      self.prevTime = new Date();
      var rds_key = 'PortCheck:'.concat(self.ip).concat(':').concat(self.port);
      tcpPortUsed.check(self.port, self.ip)
        .then(function (inUse) {
          var now = new Date();
          var msnow = Date.parse(now);
          var diffms = now - self.prevTime;
          //console.log('PortCheck:', self.ip, self.port, ':', inUse, now, msnow, diffms);

          if (!inUse) {
            client.hset(rds_key, msnow, 0);
            config.changeToArrParityDisconnect(self.address);
          } else {
            client.hset(rds_key, msnow, diffms);
            config.changeToArrParity(self.address);
          }
          client.expireat(rds_key, parseInt((+new Date()) / 1000) + 86400);

          setTimeout(function () {
            next();
          }, config.serverPortCheckDelay);
        }, function (err) {
          var now = new Date();
          console.log('[[[[PortCheck Error]]]]', self.ip, self.port, ':', now);
          console.error('PortCheck Error:', err.message);
          client.hset(rds_key, msnow, 0);
          client.expireat(rds_key, parseInt((+new Date()) / 1000) + 86400);
          config.changeToArrParityDisconnect(self.address);
          setTimeout(function () {
            next();
          }, config.serverPortCheckDelay);
        });
    },
    function (err) {
      console.log('!!!! serverPortCheckService STOP ', self.ip, self.port, '!!!!');
    }
  );
};

module.exports = checker;