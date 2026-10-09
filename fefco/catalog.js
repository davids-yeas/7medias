// Catalogue complet des codes listés dans le PDF FEFCO (12e édition), séries 0100 à 0500.
// Les séries 0600 à 0900 restent à relever. Format : "code:montage" (M manuel, A automatique, M/A les deux).
(function (root) {
  const SERIES = {
    '0100': 'Rouleaux et feuilles',
    '0200': 'Caisses à rabats',
    '0300': 'Boîtes télescopiques',
    '0400': 'Boîtes et plateaux',
    '0500': 'Boîtes coulissantes',
  };
  const RAW = {
    '0100': '0100 0110 0111 0112 0113 0119 0121 0122 0123 0129 0130',
    '0200': '0200:M/A 0201:M/A 0202:M/A 0203:M/A 0204:M/A 0205:M/A 0206:M/A 0207:M 0208:M 0209:M/A 0210:M 0211:M 0212:M/A 0214:M 0215:M 0216:M 0217:M 0218:M 0219:M 0220:M 0221:M 0222:M 0225:M 0226:M 0227:M 0228:M/A 0229:M 0229.1:M 0230:M/A 0231:M/A 0232:M 0233:M 0233.1:M 0240:M 0241:M 0242:M',
    '0300': '0300:M/A 0301:M/A 0302:M 0303:M 0304:M 0306:M/A 0307:M 0308:M 0309:M 0310:M/A 0312:M/A 0313:M/A 0314:M 0319:M/A 0320:M/A 0321:M 0322:M 0323:M 0325:M/A 0330:M/A 0331:M/A 0350:A 0351:M/A 0352:M/A 0360:M',
    '0400': '0400:M 0401:M 0402:M 0403:M 0404:M 0405:M 0406:A 0407:M 0409:M/A 0410:M/A 0411:M/A 0412:M 0413:M/A 0414:M 0415:M/A 0416:M 0418:M 0420:M/A 0421:M/A 0422:M/A 0423:M/A 0424:M/A 0425:M/A 0425.1:M/A 0426:M 0427:M 0427.1:M 0428:M 0429:M 0430:M/A 0431:M 0432:M 0433:M 0434:A 0435:M/A 0435.1:M/A 0436:M 0436.1:A 0436.2:A 0437:M 0438:A 0439:M 0440:A 0441:A 0442:M 0443:M 0444:M 0445:M 0446:A 0447:M 0448:M 0449:M 0449.1:M 0450:M 0451:M 0451.1:M 0452:A 0453:A 0454:M 0455:M 0456:M 0457:M 0458:M 0459:A 0459.1:A 0460:A 0461:M/A 0462:M 0463:M 0464:M 0465:M 0466:M 0469:M 0470:M 0471:M 0472:M 0473:M 0474:M 0475:M 0476:M 0480:A 0481:M 0482:M 0483:A 0484:M 0485:M',
    '0500': '0501:M 0502:M 0503:M 0504:M 0505:M 0507:M 0509:M 0510:M 0511:M 0512:M',
  };
  const list = [];
  Object.keys(RAW).forEach((s) => RAW[s].split(/\s+/).forEach((t) => {
    const p = t.split(':'); list.push({ c: p[0], m: p[1] || '', s });
  }));
  root.FEFCO_CATALOG = { series: SERIES, list };
})(typeof window !== 'undefined' ? window : globalThis);
