/* Host adapter: itch.io HTML5 embed (no SDK, no ads).
 * Docs: https://itch.io/docs/creators/html5
 * itch.io serves the uploaded ZIP in an iframe on its own domain. There is no host SDK: nothing is
 * loaded from outside the ZIP, there are no ads, and progress stays in the browser's own storage. */
(function (root) {
  'use strict';
  var H = root.CreaseLite;
  H.host = {
    name: 'itch',
    cloud: false,
    init: function () { return Promise.resolve(null); },
    warn: function () {},
    error: function () {},
  };
})(window);
