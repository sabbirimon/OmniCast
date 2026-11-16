'use strict';

const models = {
  A202SH: { title: 'AQUOS R7', style: 'aquos', brand: 'Sharp', photo: 'https://jp.sharp/products/aquos-r7/s/images/img_spec_color_black.png' },
  'SH-52C': { title: 'AQUOS R7', style: 'aquos', brand: 'Sharp', photo: 'https://jp.sharp/products/aquos-r7/d/images/img_spec_color_black.png' },
};

function profile(model, manufacturer = '', form = '') {
  if (models[model]) return models[model];
  if (/tablet/i.test(form)) return { title: model, style: 'tablet' };
  if (/tv|television/i.test(form)) return { title: model, style: 'tv' };
  if (/^pixel/i.test(model)) return { title: model, style: 'pixel', brand: 'Google' };
  if (/samsung/i.test(manufacturer) || /^SM-/i.test(model)) return { title: model, style: 'galaxy', brand: 'Samsung' };
  if (/sharp/i.test(manufacturer) || /aquos/i.test(model)) return { title: model, style: 'aquos', brand: 'Sharp' };
  return { title: model, style: 'phone', brand: manufacturer };
}

module.exports = { profile };
