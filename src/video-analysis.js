import { get } from './api.js';

const videos = [
  { name: 'V3', id: '1429694178856197', sold: '6 purchases ($434) - BEST SELLER' },
  { name: 'V1', id: '924373026879216', sold: '3 purchases ($54)' },
  { name: 'V6', id: '789031073793016', sold: '3 purchases ($27)' },
  { name: 'V8', id: '1474455957572357', sold: '2 purchases ($27)' },
  { name: 'V9', id: '3860180050953247', sold: '1 purchase ($27)' },
];

for (const v of videos) {
  try {
    const data = await get('/' + v.id, {
      fields: 'title,description,length,thumbnails{uri,width,height},source',
    });
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📹 ' + v.name + ' | Duration: ' + data.length?.toFixed(1) + 's');
    console.log('💰 ' + v.sold);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (data.description) console.log('Description: ' + data.description);
    if (data.thumbnails?.data) {
      const best = data.thumbnails.data.sort((a, b) => (b.width || 0) - (a.width || 0))[0];
      if (best) console.log('Thumb (' + best.width + 'x' + best.height + '): ' + best.uri);
    }
    if (data.source) console.log('Video: ' + data.source.substring(0, 200));
  } catch (e) {
    console.log(v.name + ' error: ' + e.message);
  }
}
