'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _class;

var _mjmlCore = require('mjml-core');

var _merge = require('lodash/merge');

var _merge2 = _interopRequireDefault(_merge);

var _min = require('lodash/min');

var _min2 = _interopRequireDefault(_min);

var _react = require('react');

var _react2 = _interopRequireDefault(_react);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var tagName = 'mc-image';
var parentTag = ['mj-column', 'mj-hero-content'];
var defaultMJMLDefinition = {
  attributes: {
    'mc:edit': null,
    'align': 'center',
    'alt': '',
    'border': 'none',
    'border-radius': null,
    'container-background-color': null,
    'height': 'auto',
    'href': '',
    'padding-bottom': null,
    'padding-left': null,
    'padding-right': null,
    'padding-top': null,
    'padding': '10px 25px',
    'src': '',
    'target': '_blank',
    'title': '',
    'vertical-align': null,
    'width': null
  }
};
var endingTag = true;
var baseStyles = {
  table: {
    borderCollapse: 'collapse',
    borderSpacing: '0'
  },
  img: {
    border: 'none',
    borderRadius: '',
    display: 'block',
    outline: 'none',
    textDecoration: 'none',
    width: '100%'
  }
};
var postRender = function postRender($) {
  $('[data-mc-edit]').each(function () {
    $(this).attr('mc:edit', $(this).attr('data-mc-edit')).removeAttr('data-mc-edit');
  });

  return $;
};

var Image = (0, _mjmlCore.MJMLElement)(_class = function (_Component) {
  _inherits(Image, _Component);

  function Image() {
    var _ref;

    var _temp, _this, _ret;

    _classCallCheck(this, Image);

    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    return _ret = (_temp = (_this = _possibleConstructorReturn(this, (_ref = Image.__proto__ || Object.getPrototypeOf(Image)).call.apply(_ref, [this].concat(args))), _this), _this.styles = _this.getStyles(), _temp), _possibleConstructorReturn(_this, _ret);
  }

  _createClass(Image, [{
    key: 'getContentWidth',
    value: function getContentWidth() {
      var _props = this.props,
          mjAttribute = _props.mjAttribute,
          getPadding = _props.getPadding;

      var parentWidth = mjAttribute('parentWidth');

      var width = (0, _min2.default)([parseInt(mjAttribute('width')), parseInt(parentWidth)]);

      var paddingRight = getPadding('right');
      var paddingLeft = getPadding('left');
      var widthOverflow = paddingLeft + paddingRight + width - parseInt(parentWidth);

      return widthOverflow > 0 ? width - widthOverflow : width;
    }
  }, {
    key: 'getStyles',
    value: function getStyles() {
      var _props2 = this.props,
          mjAttribute = _props2.mjAttribute,
          defaultUnit = _props2.defaultUnit;


      return (0, _merge2.default)({}, baseStyles, {
        td: {
          width: this.getContentWidth()
        },
        img: {
          border: mjAttribute('border'),
          height: mjAttribute('height'),
          borderRadius: defaultUnit(mjAttribute('border-radius'), "px")
        }
      });
    }
  }, {
    key: 'renderImage',
    value: function renderImage() {
      var mjAttribute = this.props.mjAttribute;


      var img = _react2.default.createElement('img', {
        'data-mc-edit': mjAttribute('mc:edit'),
        alt: mjAttribute('alt'),
        title: mjAttribute('title'),
        height: mjAttribute('height'),
        src: mjAttribute('src'),
        style: this.styles.img,
        width: this.getContentWidth() });

      if (mjAttribute('href') != '') {
        return _react2.default.createElement(
          'a',
          {
            href: mjAttribute('href'),
            target: mjAttribute('target') },
          img
        );
      }

      return img;
    }
  }, {
    key: 'render',
    value: function render() {
      var mjAttribute = this.props.mjAttribute;


      return _react2.default.createElement(
        'table',
        {
          className: 'mc-image',
          cellPadding: '0',
          cellSpacing: '0',
          'data-legacy-align': mjAttribute('align'),
          'data-legacy-border': '0',
          style: this.styles.table },
        _react2.default.createElement(
          'tbody',
          null,
          _react2.default.createElement(
            'tr',
            null,
            _react2.default.createElement(
              'td',
              { style: this.styles.td },
              this.renderImage()
            )
          )
        )
      );
    }
  }]);

  return Image;
}(_react.Component)) || _class;

Image.tagName = tagName;
Image.parentTag = parentTag;
Image.defaultMJMLDefinition = defaultMJMLDefinition;
Image.endingTag = endingTag;
Image.baseStyles = baseStyles;
Image.postRender = postRender;

exports.default = Image;
