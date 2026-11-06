// ============ 挑战关卡数据（世界 1800×1000） ============
// winCondition 默认为歼灭全部敌人；surviveTurns 为生存关
export const CHALLENGES = [
  {
    id: 'c1', icon: '🎯', name: '新兵打靶',
    desc: '只有火箭弹。用最少的回合送走这只落单的虫虫。',
    theme: 'islands', seed: 20260101, difficulty: 'easy',
    playerWorms: [{ x: 330, name: '新兵', color: '#4d96ff', hat: 'cap' }],
    enemies: [{ x: 1430, name: '靶子', color: '#ef476f', hat: 'bow', hp: 45 }],
    ammoPlayer: { grenade: 0, shotgun: 0, cluster: 0, airstrike: 0, driller: 0 },
    noSuddenDeath: true, noCrates: false,
    rankS: 1, rankSHp: 90, rankA: 2,
  },
  {
    id: 'c2', icon: '🔫', name: '峡谷狙击',
    desc: '散弹枪狙击训练：敌人躲在峡谷另一头，但没有视线遮挡就逃不掉。',
    theme: 'desert', seed: 777001, difficulty: 'normal',
    playerWorms: [{ x: 250, name: '枪手', color: '#6bd968', hat: 'bandana' }],
    enemies: [
      { x: 1470, name: '沙匪A', color: '#ef476f', hat: 'helmet', hp: 55 },
      { x: 1580, name: '沙匪B', color: '#f78c6b', hat: 'cap', hp: 55 },
    ],
    ammoPlayer: { bazooka: 0, grenade: 0, shotgun: 4, cluster: 0, airstrike: 0, driller: 0 },
    noSuddenDeath: true, noCrates: true,
    rankS: 2, rankSHp: 80, rankA: 3,
  },
  {
    id: 'c3', icon: '✈️', name: '空袭求生',
    desc: '敌军拥有无限空中支援！带上两只虫虫活下去。',
    theme: 'islands', seed: 424242, difficulty: 'hard',
    playerWorms: [
      { x: 400, name: '幸存者', color: '#ffd93d', hat: 'helmet' },
      { x: 540, name: '乐天派', color: '#b980ff', hat: 'flower' },
    ],
    enemies: [
      { x: 1290, name: '机长', color: '#ef476f', hat: 'cap', hp: 80 },
      { x: 1400, name: '投弹手', color: '#f78c6b', hat: 'tophat', hp: 80 },
      { x: 1510, name: '领航员', color: '#06d6a0', hat: 'bandana', hp: 80 },
    ],
    ammoPlayer: {},
    ammoEnemy: { airstrike: Infinity },
    surviveTurns: 6, noCrates: false,
    rankS: 4, rankSHp: 120, rankA: 5,
  },
  {
    id: 'c4', icon: '💣', name: '手雷速攻',
    desc: '只有手雷！水位上涨得飞快，抓紧时间。',
    theme: 'islands', seed: 90210, difficulty: 'normal',
    playerWorms: [
      { x: 300, name: '爆破手', color: '#ff9f43', hat: 'bandana' },
      { x: 430, name: '点火员', color: '#ff6b81', hat: 'cap' },
    ],
    enemies: [
      { x: 1350, name: '守卫A', color: '#ef476f', hat: 'helmet', hp: 60 },
      { x: 1460, name: '守卫B', color: '#9b5de5', hat: 'tophat', hp: 60 },
    ],
    ammoPlayer: { bazooka: 0, shotgun: 0, cluster: 0, airstrike: 0, driller: 0 },
    suddenDeathRound: 3, noCrates: true,
    rankS: 3, rankSHp: 100, rankA: 4,
  },
  {
    id: 'c5', icon: '🐑', name: '神圣一击',
    desc: '神圣手雷三连投，清掉挤在一起的敌人。1 回合解决可拿 S。',
    theme: 'snow', seed: 121231, scene: 'holyBowl', difficulty: 'hard',
    playerWorms: [{ x: 300, name: '牧师', color: '#ffffff', hat: 'tophat' }],
    enemies: [
      { x: 1420, name: '信徒A', color: '#ef476f', hat: 'bow', hp: 1 },
      { x: 1440, name: '信徒B', color: '#9b5de5', hat: 'bow', hp: 1 },
      { x: 1460, name: '信徒C', color: '#f78c6b', hat: 'bow', hp: 1 },
    ],
    ammoPlayer: { bazooka: 0, grenade: 0, shotgun: 0, cluster: 0, airstrike: 0, driller: 0, holy: 3 },
    noSuddenDeath: true, noCrates: true, noWind: true,
    rankS: 1, rankSHp: 90, rankA: 3,
  },
  {
    id: 'c6', icon: '🌋', name: '熔岩末日',
    desc: '岩浆已经漫到脚下，对面还是精英部队。放手一搏。',
    theme: 'lava', seed: 666666, difficulty: 'hard',
    playerWorms: [
      { x: 320, name: '敢死队', color: '#ff5a2a', hat: 'helmet' },
      { x: 450, name: '焰尾', color: '#ffd93d', hat: 'bandana' },
    ],
    enemies: [
      { x: 1370, name: '炎魔A', color: '#ef476f', hat: 'helmet', hp: 75 },
      { x: 1490, name: '炎魔B', color: '#9b5de5', hat: 'tophat', hp: 75 },
    ],
    ammoPlayer: {},
    waterY: 780, turnTime: 30, suddenDeathRound: 4,
    rankS: 4, rankSHp: 90, rankA: 6,
  },
];
