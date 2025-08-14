// herbManager handles initialization and retrieval of herbal library data.
// It reads and writes from the Firestore collection "herbLibrary" and
// falls back to default herbs and formulas if none exist.

import {
  getCollection,
  setDocument
} from '../firebase/firestore.js';

// Default herbs and formulas are defined based on the values
// in the original application.  You can extend or modify these
// arrays as needed.

const defaultHerbs = [
  {
    id: 5001,
    type: 'herb',
    name: '人參',
    latinName: 'Panax ginseng',
    category: '補氣藥',
    effects: '大補元氣，復脈固脫，益氣養血，健脾益肺',
    indications: '氣虛欲脫，脈微欲絕，氣短乏力，食少便溏',
    usage: '3–9g，另煎後入',
    createdAt: new Date().toISOString()
  },
  {
    id: 5002,
    type: 'herb',
    name: '白朮',
    latinName: 'Atractylodes macrocephala',
    category: '補氣藥',
    effects: '補氣健脾，燥濕利水，止汗安胎',
    indications: '脾胃虛弱，食少便溏，水腫，小便不利',
    usage: '6–12g',
    createdAt: new Date().toISOString()
  }
];

const defaultFormulas = [
  {
    id: 6001,
    type: 'formula',
    name: '四君子湯',
    source: '太平惠民和劑局方',
    effects: '益氣健脾',
    indications: '脾胃氣虛，面色萎白，語聲低微，氣短乏力，食少便溏，舌淡苔白，脈虛弱',
    composition: '人參\n白朮\n茯苓\n甘草',
    usage: '水煎服，每日一劑，分二次溫服',
    cautions: '陰虛火旺者慎用',
    createdAt: new Date().toISOString()
  },
  {
    id: 6002,
    type: 'formula',
    name: '六君子湯',
    source: '醫學正傳',
    effects: '益氣健脾，燥濕化痰',
    indications: '脾胃氣虛兼有痰濕，食少便溏，胸脘痞悶，嘔逆等症',
    composition: '人參\n白朮\n茯苓\n甘草\n陳皮\n半夏',
    usage: '水煎服，每日一劑，分二次溫服',
    cautions: '陰虛燥咳、津液不足者忌用',
    createdAt: new Date().toISOString()
  }
];

export default class HerbManager {
  constructor() {
    this.collectionName = 'herbLibrary';
  }

  /**
   * Ensure the herbal library exists in Firestore.  If no documents are
   * present, default herbs and formulas will be inserted.
   */
  async initHerbLibrary() {
    const herbs = await getCollection(this.collectionName);
    if (herbs.length === 0) {
      const combined = [...defaultHerbs, ...defaultFormulas];
      for (const item of combined) {
        await setDocument(this.collectionName, String(item.id), item);
      }
      return combined;
    }
    return herbs;
  }

  /**
   * Fetch all herb library entries.
   */
  async getHerbs() {
    return getCollection(this.collectionName);
  }
}