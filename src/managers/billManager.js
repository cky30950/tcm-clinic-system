// billManager handles initialization and retrieval of billing items.
// It populates a default set of billing items into Firestore if none exist.

import {
  getCollection,
  setDocument
} from '../firebase/firestore.js';

const defaultBillingItems = [
  {
    id: 4001,
    name: '診金',
    category: 'consultation',
    price: 150,
    unit: '次',
    description: '中醫師診症費用',
    active: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 4002,
    name: '複診費',
    category: 'consultation',
    price: 120,
    unit: '次',
    description: '複診病人診症費用',
    active: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 4003,
    name: '急診費',
    category: 'consultation',
    price: 200,
    unit: '次',
    description: '急診或非辦公時間診症',
    active: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 4011,
    name: '中藥調劑費',
    category: 'medicine',
    price: 25,
    unit: '劑',
    description: '中藥材調劑及包裝費用',
    active: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 4012,
    name: '濃縮中藥粉',
    category: 'medicine',
    price: 15,
    unit: '包',
    description: '科學中藥濃縮粉劑',
    active: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 4013,
    name: '外用藥膏',
    category: 'medicine',
    price: 80,
    unit: '支',
    description: '中藥外用藥膏',
    active: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 4014,
    name: '藥酒',
    category: 'medicine',
    price: 120,
    unit: '瓶',
    description: '中藥浸製藥酒',
    active: true,
    createdAt: new Date().toISOString()
  }
];

export default class BillManager {
  constructor() {
    this.collectionName = 'billingItems';
  }

  /**
   * Ensure the billing items collection exists, populating defaults
   * if it is empty.
   */
  async initBillingItems() {
    const items = await getCollection(this.collectionName);
    if (items.length === 0) {
      for (const item of defaultBillingItems) {
        await setDocument(this.collectionName, String(item.id), item);
      }
      return defaultBillingItems;
    }
    return items;
  }

  /**
   * Fetch all billing items.
   */
  async getBillingItems() {
    return getCollection(this.collectionName);
  }
}