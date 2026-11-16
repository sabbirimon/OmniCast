'use strict';

const samsungPhotos = 'https://images.samsung.com/is/image/samsung/p6pim/ca/2401/gallery/';
const googlePhotos = 'https://lh3.googleusercontent.com/';
const oneplusPhotos = 'https://oasis.opstatics.com/content/dam/oasis/page/';
const modelGroups = [
  { models: ['A202SH'], title: 'AQUOS R7', style: 'aquos', brand: 'Sharp', photo: 'https://jp.sharp/products/aquos-r7/s/images/img_spec_color_black.png' },
  { models: ['SH-52C'], title: 'AQUOS R7', style: 'aquos', brand: 'Sharp', photo: 'https://jp.sharp/products/aquos-r7/d/images/img_spec_color_black.png' },
  { models: ['SM-A207F', 'SM-A207F/DS', 'Galaxy A20s'], title: 'Galaxy A20s', style: 'galaxy', brand: 'Samsung',
    photo: 'https://images.samsung.com/is/image/samsung/es-galaxy-a20s-sm-a207fzkdeub-front-thumb-263572451?fmt=png-alpha&wid=480' },
  { models: ['SM-S9210', 'SM-S921B', 'SM-S921B/DS', 'SM-S921N', 'SM-S921U', 'SM-S921U1', 'SM-S921W', 'Galaxy S24'],
    title: 'Galaxy S24', style: 'galaxy', brand: 'Samsung',
    photo: samsungPhotos + 'ca-galaxy-s24-sm-s921wzkexac-539292312?fmt=png-alpha&wid=480' },
  { models: ['SM-S9280', 'SM-S928B', 'SM-S928B/DS', 'SM-S928N', 'SM-S928U', 'SM-S928U1', 'SM-S928W', 'Galaxy S24 Ultra'],
    title: 'Galaxy S24 Ultra', style: 'galaxy', brand: 'Samsung',
    photo: samsungPhotos + 'ca-galaxy-s24-s928-sm-s928wzkexac-539323261?fmt=png-alpha&wid=480' },
  { models: ['Pixel 8'], title: 'Pixel 8', style: 'pixel', brand: 'Google',
    photo: googlePhotos + 'IigjdpP92zuyA1JFiHUMCdnxq0Lo2HtHF5VmSeQDkxmLsHLE85holHTfuFXq21OsMrxxYCwmVmEelST9Xi86j-iGlZTiVHO0NLg=w480' },
  { models: ['Pixel 9a'], title: 'Pixel 9a', style: 'pixel', brand: 'Google',
    photo: googlePhotos + 'GNVXeCnsRERpW0aHvoDRIVwJnqiFIlykd32GIqA3YGHNrUGjD1NHAFGBc3WGAS4ThurxfgOqcpxIQ4llH-H3w95AxBeqmsUQYw=w480' },
  { models: ['Pixel 10'], title: 'Pixel 10', style: 'pixel', brand: 'Google',
    photo: googlePhotos + '6BW_pqhtFwQx83kww0_oS6VT6mlfS5yiT27BqpzJql5zKQyjXMmqbMmOovxWQScjOvXBAL0kVAPbBzrox-Ew188mdjnkHTIGPQI=w480' },
  { models: ['CPH2573', 'CPH2581', 'CPH2583', 'OnePlus 12'], title: 'OnePlus 12', brand: 'OnePlus',
    photo: oneplusPhotos + '2023/cn/12/12-black.png' },
  { models: ['CPH2649', 'CPH2653', 'OnePlus 13'], title: 'OnePlus 13', brand: 'OnePlus',
    photo: oneplusPhotos + '2024/global/phones/13/specs/13-black.png' },
];
const catalog = new Map(modelGroups.flatMap(({ models, ...details }) => models.map((model) => [model.toLowerCase(), details])));
const brands = [
  ['Sharp', 'sharp'], ['Samsung', 'samsung'], ['Google', 'google'], ['OnePlus', 'oneplus'],
  ['Xiaomi', 'xiaomi|redmi|poco'], ['Motorola', 'motorola|moto'], ['Sony', 'sony|xperia'],
  ['OPPO', 'oppo'], ['Honor', 'honor'], ['Huawei', 'huawei'], ['ASUS', 'asus'],
  ['Lenovo', 'lenovo'], ['vivo', 'vivo|iqoo'], ['Nokia', 'nokia|hmd'],
].map(([name, value]) => [name, new RegExp('\\\\b(?:' + value + ')\\\\b', 'i')]);

function profile(model, manufacturer = '', form = '') {
  const exact = catalog.get((model || '').trim().toLowerCase());
  if (exact) return exact;
  const brand = brands.find(([, pattern]) => pattern.test(manufacturer) || pattern.test(model))?.[0]
    || (/^SM-/i.test(model) ? 'Samsung' : /^Pixel\b/i.test(model) ? 'Google' : /aquos/i.test(model) ? 'Sharp' : manufacturer);
  let style = { Sharp: 'aquos', Samsung: 'galaxy', Google: 'pixel' }[brand] || 'phone';
  if (/tablet/i.test(form)) style = 'tablet';
  if (/tv|television/i.test(form)) style = 'tv';
  return { title: model, style, brand };
}

function logo(brand) {
  if (brand === 'Sharp') return '/sharp-mark.png';
  const slug = brands.find(([name]) => name === brand)?.[0].toLowerCase();
  return slug ? '/brands/' + slug + '.png' : '';
}

module.exports = { logo, profile, modelGroups };
