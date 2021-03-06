/* global getRow send  */

module.exports = function(head, req) {
  function Calculator(SCORE_BASE, SCORE_LENGTH) {
    var SCORE_INDEX = 1 - SCORE_BASE - SCORE_LENGTH;
    return function score(pattern, input) {
      input = String(input);
      var length = input.length;
      var value = null;
      var match = pattern.exec(input);
      if (match) {
        value =
          SCORE_BASE +
          SCORE_LENGTH * Math.sqrt(match[0].length / length) +
          SCORE_INDEX * (1 - match.index / length);
      }
      return value;
    };
  }

  var score = Calculator(0.3, 0.25);

  var row;
  var rows = [];

  while ((row = getRow())) {
    rows.push(row);
  }

  if (req.query.q) {
    var q = req.query.q.split('OR');
    rows.forEach(function(row) {
      row.score = 0;
      q.forEach(function(part) {
        part = part.split(':');
        if (part[0].trim() !== '*') {
          row.score +=
            score(
              new RegExp(part[1].trim(), 'gi'),
              row.value[part[0].trim()]
            ) || 0;
        }
      });
    });
  }

  if (req.query.sort || req.query.q) {
    var sort = req.query.sort !== undefined ? req.query.sort : '';

    var property = /^(")?(-)?([a-z0-9]+)(")?/i.exec(sort);
    var type = /<score>|<string>|<number>/.exec(sort);
    var reverse = /^(")?-/.test(sort);

    property = property ? property[3] : '<score>';
    type = type ? type[0] : sort !== '' ? null : '<score>';

    rows.sort(function(a, b) {
      if (property !== '<score>' && (!a.doc[property] || !b.doc[property])) {
        return 0;
      }

      switch (type) {
        case '<score>':
          if (a.score > b.score) return reverse ? 1 : -1;
          if (a.score < b.score) return reverse ? -1 : 1;
          break;
        default:
          if (a.doc[property] < b.doc[property]) return reverse ? 1 : -1;
          if (a.doc[property] > b.doc[property]) return reverse ? -1 : 1;
          break;
      }

      return 0;
    });
  }

  var offset = req.query.offset || 0;
  var limit = req.query.limit || rows.length;

  send(
    JSON.stringify({
      total_rows: rows.length,
      rows: rows.slice(offset, limit),
    })
  );
};
