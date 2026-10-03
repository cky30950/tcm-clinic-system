/* ============================================================
 * landing-i18n.js — 名醫診所系統 landing page 三語切換
 * 語言：zh-HK（繁體，預設）／zh-CN（简体）／en（English）
 * 機制：data-i18n / data-i18n-html + data-i18n-alt 等屬性鍵
 * 偏好以 localStorage('landing-lang') 持久化，不變更 URL
 * ============================================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'landing-lang';
  var SUPPORTED = ['zh-HK', 'zh-CN', 'en'];
  var LANG_LABEL = { 'zh-HK': '繁體', 'zh-CN': '简体', 'en': 'EN' };

  /* ---------------- 简体中文 ---------------- */
  var zhCN = {
    'nav.features': '功能特色',
    'nav.pwa': 'PWA 应用',
    'nav.tcm': '中医特色',
    'nav.tele': '视频看诊',
    'nav.att': '病历附件',
    'nav.backup': '自动备份',
    'nav.member': '会员系统',
    'nav.security': '安全保障',
    'nav.pricing': '方案价格',

    'cta.contact': '联系我',
    'cta.demo': '🗓️ 预约 15 分钟网上演示',
    'cta.wa': '📞 WhatsApp 直接咨询',
    'cta.wa.long': '📞 WhatsApp：+852 54393401',

    'hero.badge': '专为中医诊所量身打造',
    'hero.title': '名医诊所系统：全方位香港中医数字化管理方案',
    'hero.subtitle': '简便 · 易用 · 高效',
    'hero.desc': '将千年中医智慧与现代科技完美结合，从「望闻问切」到「辨证论治」全面数字化',
    'hero.designer': '由中医师设计的中医诊所系统，更符合中医需求',
    'hero.stat.stable': '系统稳定运行',
    'hero.stat.time': '看诊时间节省',

    'feat.tag': '完整功能模块',
    'feat.title': '诊所运营的完美闭环',
    'feat.sub': '从前台挂号到后台管理，一站式解决所有需求',

    'f1.t': '在线预约挂号',
    'f1.d': '可通过手机或电脑 24 小时在线预约，自由选择医师与看诊时段，系统自动同步更新诊所排班。',
    'f2.t': '智能问诊系统',
    'f2.d': '数字化「十问歌」，12 步引导式问卷涵盖寒热、汗出、二便、睡眠等，候诊时间即完成体质初评。',
    'f3.t': '电子病历管理',
    'f3.d': '完整的患者数据库，支持病历搜索、历史记录追踪、诊断模板快速录入，让医师专注于诊疗本身。',
    'f4.t': '排班与报表',
    'f4.d': '可视化医师排班管理、营收统计分析、患者来源追踪，数据驱动的经营决策从此更加精准。',
    'f5.t': '药房库存管理',
    'f5.d': '中药材进销存追踪、低库存自动提醒、开方自动扣库，让药房管理井井有条。',
    'f6.t': '自定义惯用组合',
    'f6.d': '可自由设置医师惯用的中药方剂组合及常用穴位搭配，看诊开方速度提升 50% 以上。',
    'f7.t': '客户套票系统',
    'f7.d': '灵活设置疗程套票（如针灸 10 次券、推拿月卡），自动扣次与有效期管理，提升患者复诊率。',
    'f8.t': '多诊所管理',
    'f8.d': '支持连锁诊所架构，一键切换不同院区，集中管理所有分院的病历与营收数据。',
    'f9.t': '财务报表',
    'f9.d': '自动生成每日/月/季财务报表，详细记录挂号费、药费、诊疗费，营收状况一目了然。',
    'f10.t': '旧资料迁移系统',
    'f10.d': '支持导入旧诊所系统的 JSON/CSV，先解析预览再执行迁移；患者资料自动比对去重，病历可按患者信息自动关联。',
    'f11.t': '资料备份与还原',
    'f11.d': '每日自动云端备份，备份文件经压缩加密后安全存放；管理员亦可随时手动同步，并提供一键还原功能，确保珍贵的医疗数据永远安全无虞。',
    'f12.t': '诊所用户管理',
    'f12.d': '精细的权限管控系统，可针对医师、护理师、前台人员设置不同操作权限，保障数据安全。',
    'f13.t': '数据自主保管',
    'f13.d': '所有诊所数据都由自己保管，安全保密。',
    'f14.t': '持续更新优化',
    'f14.d': '未来系统会持续更新及新增功能，完善使用体验。',

    'ss.tag': '系统界面预览',
    'ss.title': '直观、易用的操作体验',
    'ss.sub': '精心设计的用户界面，让诊所同仁无需繁杂学习即可快速上手',
    'ss.alt1': '名医诊所系统 - 中医挂号与候诊管理界面',
    'ss.alt2': '中医系统交互式穴位地图与经络定位功能',
    'ss.alt3': '中医诊所自动化中药库存管理与本草纲目数据库',
    'ss.alt4': '名医诊所系统 - 医护排班与多诊所同步规划',
    'ss.t1': '高效挂号看诊',
    'ss.d1': '一目了然的候诊列表与实时状态管理',
    'ss.t2': '交互式穴位地图',
    'ss.d2': '可视化经络定位，辅助医师精准诊疗',
    'ss.t3': '智能中药库管理',
    'ss.d3': '详尽的药材属性与库存自动预警系统',
    'ss.t4': '专业排班规划',
    'ss.d4': '清晰的医护排班日历，支持多诊所同步',

    'pwa.tag': 'PWA 渐进式网页应用',
    'pwa.title': '无需下载 App，安装到手机与电脑',
    'pwa.sub': '打开浏览器即可「添加到主屏幕」，安装后全屏启动、没有地址栏，配合即时推送与离线缓存，使用体验与原生 App 无异，却没有 App Store 的繁琐手续。',
    'pwa.1t': '一键添加到主屏幕',
    'pwa.1d': 'iPhone、Android、Mac 均可安装，启动后全屏显示、没有浏览器地址栏，桌面还会出现专属图标，就像为诊所定制的 App。',
    'pwa.2t': '即时推送通知',
    'pwa.2d': '使用系统期间，患者候诊、看诊完成、公开频道及私人聊天消息即时推送至手机与电脑；登出或关闭系统后自动停止，下班不打扰。',
    'pwa.3t': '离线照常打开',
    'pwa.3d': '网络不稳或完全离线时仍可打开系统与已缓存内容，恢复联网后自动同步最新数据，诊所运作不受网络中断影响。',
    'pwa.4t': '秒速打开',
    'pwa.4d': 'Service Worker 预先缓存界面与资源，第二次启动几乎即时完成，无需等待加载，旧手机同样流畅。',
    'pwa.5t': '永远是最新版本',
    'pwa.5d': '系统更新在后台自动完成，不必到手机应用商店手动升级，每次打开即是最新功能，同仁使用零落差。',
    'pwa.6t': '不占空间 · 零广告',
    'pwa.6d': '安装仅占极小空间，不需开放大量权限，没有应用商店审查束缚，更不会有第三方推送广告。',
    'pwa.stepst': '三步完成安装',
    'pwa.ip1': '1. 使用 <strong>Safari</strong> 打开诊所网址',
    'pwa.ip2': '2. 点击底部「分享」按钮（方框向上箭头 ⬆️）',
    'pwa.ip3': '3. 选择「添加到主屏幕」即可',
    'pwa.an1': '1. 用 Chrome 打开诊所网址',
    'pwa.an2': '2. 点击右上角菜单（三个点）',
    'pwa.an3': '3. 选择「添加到主屏幕」或「安装应用」',
    'pwa.pc1': '1. 以 Chrome 或 Edge 打开网址',
    'pwa.pc2': '2. 点击地址栏右侧的安装图标',
    'pwa.pc3': '3. 确认后即完成，Mac 也支持推送',

    'tcm.tag': '中医专属功能',
    'tcm.title': '传承千年智慧',
    'tcm.sub': '深度整合中医专业知识的诊所系统',
    'tcm.1t': '数字化本草纲目',
    'tcm.1s': '完整中药材数据库',
    'tcm.1l1': '内置数百种药材的<strong class="text-white">性味归经</strong>资料（如：甘微苦、入脾肺经）',
    'tcm.1l2': '详载每味药的<strong class="text-white">功效、主治、禁忌</strong>（十八反十九畏自动提醒）',
    'tcm.1l3': '内置<strong class="text-white">经典方剂模板</strong>（桂枝汤、六味地黄丸……），一键调用快速加减',
    'tcm.2t': '交互式穴位地图',
    'tcm.2s': '针灸治疗强力辅助',
    'tcm.2l1': '支持<strong class="text-white">数百个穴位</strong>的精确定位（百会、足三里、合谷……）',
    'tcm.2l2': '可视化人体经络图，支持<strong class="text-white">放大镜功能</strong>查看细节',
    'tcm.2l3': '自动<strong class="text-white">繁简中文转换</strong>，适合两岸三地诊所使用',
    'tcm.3t': '辨证论治辅助',
    'tcm.3s': '标准化诊疗流程',
    'tcm.3l1': '内置<strong class="text-white">诊断模板库</strong>，涵盖常见证型（肝郁气滞、脾肾阳虚……）',
    'tcm.3l2': '根据症状输入提供<strong class="text-white">智能诊断建议</strong>，辅助医师辨证',
    'tcm.3l3': '支持<strong class="text-white">脉象、舌象记录</strong>，完整保存四诊资料',
    'tcm.4t': '体质分析问卷',
    'tcm.4s': '「问诊」数字化',
    'tcm.4l1': '<strong class="text-white">寒热辨别</strong>：怕冷/怕热、手脚冰冷程度评估',
    'tcm.4l2': '<strong class="text-white">二便评估</strong>：小便颜色（淡黄/深黄/红赤）、大便形状分析',
    'tcm.4l3': '<strong class="text-white">汗出分析</strong>：自汗、盗汗判断（肾阴虚/阳虚依据）',

    'tele.tag': '全球节点视频看诊',
    'tele.title': '内置视频看诊功能',
    'tele.sub': '全球实时通讯节点网络（SD-RTN™），自动选择最优线路，即使患者身处海外或跨境，也能流畅高清应诊',
    'tele.h3': '患者在哪里，诊室就在哪里',
    'tele.p': '专为香港中医看诊而设的视频看诊功能。医师在看诊系统内一按即可开启专属诊室，与电子病历、开方记录无缝衔接；患者不论身在香港、内地还是海外，只要打开收到的诊室链接，就能与医师面对面应诊。',
    'tele.l1': '<strong style="color: #1E1E1E;">全球节点智能路由：</strong>遍布全球的通讯节点按患者所在地自动择优接入，跨境连线同样低延迟、不卡顿',
    'tele.l2': '<strong style="color: #1E1E1E;">高清画质自动适应：</strong>按网络状况自动调整画质，Wi‑Fi、4G／5G 环境下均可稳定通话',
    'tele.l3': '<strong style="color: #1E1E1E;">电子同意书＋加密传输：</strong>患者进入诊室前须先签署电子同意书并自动存档，看诊过程全程加密，保障双方隐私',
    'tele.c1t': '全球节点　智能调度',
    'tele.c1d': '遍布全球的实时通讯节点，按患者所在地自动选择最优线路，就近接入、跨境低延迟。',
    'tele.c2t': '一条链接　免装 App',
    'tele.c2d': '患者无须下载程序，通过收到的诊室链接，浏览器打开即可应诊，省去安装与登录。',
    'tele.c3t': '电子同意书　隐私稳妥',
    'tele.c3d': '进入诊室前须先细阅并签署电子同意书，同意时间与版本自动存档；视频全程加密，不可擅自录像。',
    'tele.c4t': '弱网自动适应重连',
    'tele.c4d': '随网速自动调整画质，4G／5G／Wi‑Fi 都稳定；网络切换或短暂断线会自动恢复，无需重新挂号。',

    'att.tag': '医学报告管理',
    'att.title': '舌象图库与医学报告',
    'att.sub': '舌象图片与医学报告（体检报告、各类检查图片）即拍即传，自动归入当次病历，历来记录一目了然',
    'att.h3': '每张图片，都对应一次看诊',
    'att.p': '看诊时拍下的舌照、患者提交的体检报告及各类图片，均可即时上传并自动链接至当次病历；图片以缩略图展示、点击即可查阅原图，并标示上传时间。医师也可随时重温患者历次舌象，跟进疗效变化更直观。',
    'att.l1': '<strong style="color: #1E1E1E;">自动归档诊次：</strong>在看诊系统或患者档案上传的照片自动归入当次病历，主诉下方显示附件缩略图、舌象字段显示舌照，翻阅病历时图文并存',
    'att.l2': '<strong style="color: #1E1E1E;">多途径影像采集：</strong>支持电脑摄像头即拍、选择文件，或用手机扫描限时 QR Code 拍照直传；视频看诊期间更可一键截取患者舌象画面',
    'att.l3': '<strong style="color: #1E1E1E;">历来舌象对比：</strong>「舌象图片」集中收录患者全部舌照并按时间排列，「医学报告及舌象图片」则包罗所有医学报告与舌照，整齐排列、一目了然',
    'att.l4': '<strong style="color: #1E1E1E;">安全合规：</strong>图片经限时签章链接直接上传至云端存储，不经诊所服务器转发、传输全程加密；仅上传者与诊所管理员可删除，所有操作均有记录',
    'att.c1t': '舌象历来记录',
    'att.c1d': '每次看诊的舌照分门别类，缩略图快速浏览、点击查看原图，比对舌质舌苔变化、追踪疗程一目了然。',
    'att.c2t': '手机扫码代拍',
    'att.c2d': '电脑屏幕显示限时 QR Code，手机扫码即打开拍照页，无须登录系统，拍摄后自动传回当前病历。',
    'att.c3t': '视频一键截图',
    'att.c3d': '视频看诊时直接截取患者画面，预览确认后即时作为舌象图片存入本次病历，异地应诊同样无障碍。',
    'att.c4t': '直传加密存储',
    'att.c4d': '云端对象存储配备限时签章链接，图片不经服务器转发、全程加密；缩略图自动生成，调阅快捷不占带宽。',

    'bk.tag': '云端自动备份',
    'bk.title': '每日自动云端备份，医疗数据万无一失',
    'bk.sub': '系统将数据自动同步至云端存储：平日增量同步，每 7 日自动完整比对；备份文件安全存放并保留两个月，管理员可随时手动同步、下载及还原。',
    'bk.s1n': '每日',
    'bk.s1d': '定时自动备份',
    'bk.s2n': '7 日',
    'bk.s2d': '自动完整比对',
    'bk.s3n': '2 个月',
    'bk.s3d': '备份文件自动保留',
    'bk.c1t': '每周自动完整比对',
    'bk.c1d': '距上次完整基线满 7 日即自动全量重读，自然排除已被删除的文件，确保云端备份与现有数据完全一致，不会残留过时记录。',
    'bk.c2t': '快照合并 · 完整组装',
    'bk.c2d': '各集合的最新完整快照集中存放于云端，每次同步后自动组装成与旧版格式兼容的完整备份文件，患者、病历、收费、套票等数据一应俱全。',
    'bk.c3t': 'gzip 高压缩存储',
    'bk.c3d': '备份 JSON 以 gzip 压缩，医疗数据一般缩小 5–10 倍，既节省云端存储空间，下载备份也更快捷，手机网络也能轻松获取。',
    'bk.c4t': '导入还原 · 快速恢复',
    'bk.c4d': '需要时导入备份文件即可还原诊所数据；管理员也可随时手动同步，或一按执行完整比对，立即校正变动与删除。',
    'bk.ch1': '仅管理员可操作',
    'bk.ch2': '同步状态透明可查',
    'bk.ch3': '备份文件保留两个月',
    'bk.ch4': '过期备份自动清理',

    'mb.tag': '会员储值系统',
    'mb.title': '储值消费．充值优惠．会员自助查询',
    'mb.sub': '从储值账户、会员折扣、诊间支付到患者自助查询一气呵成的会员体系，提升患者预存与复诊意愿，且每一笔金额往来都有据可查。',
    'mb.h3': '一套账户，贯穿诊间与患者',
    'mb.p': '会员系统以「储值账户」为核心：患者在诊所充值后，<strong style="color: #1E1E1E;">本金与充值赠送额分开记录</strong>；看诊收费时可直接以储值余额支付，有效会员开单更会自动带入诊所设置的统一折扣。患者也可随时以在诊所登记的手机号码，自行查阅余额、有效套票与交易记录。',
    'mb.l1': '<strong style="color: #1E1E1E;">本金／赠送额清楚分列：</strong>充值优惠以级距赠送金额发放，由诊所自定规则（例如充满足 HK$1,000 即赠 HK$50），赠额由系统服务器自动计算，扣款顺序也可设置（默认先扣赠送额）。',
    'mb.l2': '<strong style="color: #1E1E1E;">开单自动会员折扣：</strong>储值账户生效中且有余额的有效会员，开立看诊单时系统自动带入诊所指定的折扣项目，职员可按实际情况手动移除，无需记住会员身份。',
    'mb.l3': '<strong style="color: #1E1E1E;">支付稳妥不重复扣款：</strong>完成病历时才执行扣款，每张看诊单配有专属识别码，网络重试不会重复扣账；万一扣款失败，病历照样保存并可即时重试；退款则按原付款比例回补本金与赠送额。',
    'mb.l4': '<strong style="color: #1E1E1E;">患者手机自助查询：</strong>打开会员查询页，输入在诊所登记的手机号码并通过人机验证即可查阅，无需账号密码；支持中／英文、同一电话多个患者（家人共用）及多间诊所独立显示，且只展示余额、套票与交易，不涉及任何病历内容。',
    'mb.mock.title': '会员查询',
    'mb.mock.bal': '储值总余额 (HKD)',
    'mb.mock.principal': '本金余额',
    'mb.mock.bonus': '赠送余额',
    'mb.mock.tickets': '有效套票',
    'mb.mock.tname': '针灸十次券',
    'mb.mock.remain': '剩余 7 次',
    'mb.mock.recent': '最近交易',
    'mb.mock.tr1': '储值充值',
    'mb.mock.tr2': '充值赠送',
    'mb.mock.tr3': '看诊消费',
    'mb.mock.note': '会员查询页界面示意（显示数值仅供说明）',
    'mb.c1t': '每诊所独立储值账户',
    'mb.c1d': '系统为每间诊所的患者独立开户，本金与赠送余额清楚分列、金额精确至 HK$0.01；账户有需要时可冻结或复用，尚有余额的账户不可随意关闭。',
    'mb.c2t': '级距充值赠送',
    'mb.c2d': '诊所可自定多级充值优惠（如充 HK$1,000 赠 HK$50），充值时由服务器自动匹配计算，前台不能擅自更改；并支持现金、转数快 FPS、EPS、信用卡、支票等多种收款方式。',
    'mb.c3t': '会员自动折扣',
    'mb.c3d': '折扣直接沿用诊所既有的收费项目设置，有效会员一开看诊单，折扣即自动出现在账单上，会员优惠无须职员人手输入或记忆，也可弹性移除。',
    'mb.c4t': '余额支付与退款把关',
    'mb.c4d': '看诊收费一勾选即以储值结账，按设置先扣赠送额再扣本金，余额不足即时提示；退款与人工调整仅管理员可执行，所有充值、扣款、退款均留下不可删改的交易流水。',
    'mb.c5t': '手机号自助查询',
    'mb.c5d': '患者输入在诊所登记的手机号码、通过人机验证后即可查阅，无需账号密码；系统设有 IP 及电话号码双重查询限速，防止扫号滥查，保障患者数据隐私。',
    'mb.c6t': '财务报表联动',
    'mb.c6d': '充值本金列为会员预存（非营业收入）、储值消费自动冲销，财务报表特设会员储值专区与每日明细，期末会员预存余额一目了然；账户与流水也纳入每日自动云端备份。',
    'mb.ch1': '充值扣款完整流水',
    'mb.ch2': '同电话支持家人多患者',
    'mb.ch3': '多诊所账户独立显示',
    'mb.ch4': '套票剩余次数与到期日同步查阅',
    'mb.ch5': '中／英文双语界面',
    'mb.ch6': '账户冻结与复用管理',

    'sec.tag': '安全与技术',
    'sec.title': '企业级安全保障',
    'sec.sub': '采用业界最高标准的安全架构，保护您的诊所与患者数据',
    'sec.1t': '域名防火墙',
    'sec.1d': 'WAF 网站应用防火墙，阻挡恶意攻击',
    'sec.2t': '云端加密存储',
    'sec.2d': 'TLS/SSL 传输加密 + 静态数据加密',
    'sec.3t': '身份认证机制',
    'sec.3d': '多重验证、凭证安全存储',
    'sec.4t': '独立数据库',
    'sec.4d': '每间诊所独立数据库，提高保密性',
    'sec.i1t': '全球 CDN 网络',
    'sec.i1d': '内容缓存至全球节点，访问速度极快',
    'sec.i2t': '全平台支持',
    'sec.i2d': '电脑、平板、手机均可流畅操作',
    'sec.i3t': '自动扩展',
    'sec.i3d': '流量高峰自动扩容，永远高性能',
    'sec.i4t': '自定义域名',
    'sec.i4d': '使用您诊所专属的网址',
    'sec.i5t': '实时同步',
    'sec.i5d': '挂号列表实时更新，不漏接患者',
    'sec.i6t': '主页设计',
    'sec.i6d': '包含专业诊所形象网站设计',

    'pr.tag': '方案价格',
    'pr.title': '简单透明的收费模式，以实惠的价格享受全面服务',
    'pr.sub': '首次架设费 + 每年维护费，无隐藏费用',
    'pr.basic.name': '基本版',
    'pr.basic.desc': '适合单一诊所使用 · 可使用 1 间诊所',
    'pr.pro.name': '进阶版',
    'pr.pro.desc': '适合多间诊所或连锁经营 · 最多可建立 5 间诊所 · 包含诊所主页设计及自定义域名',
    'pr.setup': '诊所系统架设费',
    'pr.once': '一次性费用',
    'pr.yearly': '诊所系统年费',
    'pr.peryear': '每年年费',
    'pr.year': '/年',
    'pr.badge': '包含维护服务',
    'pr.b1': '服务器架设',
    'pr.b2': '诊所系统设置',
    'pr.b3': '1 间诊所使用',
    'pr.b4': '服务器租用',
    'pr.b5': '诊所系统的更新及维护',
    'pr.b6': '技术支持',
    'pr.p1': '诊所主页设计及架设',
    'pr.p2': 'SEO（搜索引擎优化）',
    'pr.p3': '自定义域名',
    'pr.p4': '诊所系统设置（最多 5 间诊所）',
    'pr.p5': '服务器流量升级',
    'pr.p6': '自定义域名租用',
    'pr.p7': '诊所系统的更新及维护（5 间诊所）',

    'faq.tag': '常见问题',
    'faq.title': '中医诊所最常问的问题',
    'faq.sub': '仍有疑问？欢迎 WhatsApp 我们，或预约 15 分钟网上演示亲身体验',
    'faq.q1': '现在的手写／Excel 病历，可以迁移到系统吗？',
    'faq.a1': '可以。系统内置「旧资料迁移」工具，支持以电子表格批量导入患者基本资料及既往看诊记录；架设阶段我们会协助核对字段及抽样检查，让您从纸质、Excel 或其他软件过渡时不会漏数据、无需重新输入。迁移完成后，所有记录会和新诊一样，可在患者档案内完整查阅。',
    'faq.q2': '患者数据安全吗？是否符合《个人资料（隐私）条例》？',
    'faq.a2': '系统按香港《个人资料（隐私）条例》（PDPO）的保障资料原则设计：只收集看诊及运营所需资料；数据传输采用加密连线，诊疗记录与附件存储于设有存取管控的云端平台；职员账号按职级分权；公开查询页有人机验证及 IP／电话双重限速。诊所才是患者数据的拥有人，我们不会出售或用于推广。详情可参阅<a href="/privacy" style="color: #B8621F; text-decoration: underline;">隐私政策</a>。',
    'faq.q3': '我不懂电脑，能用吗？',
    'faq.a3': '系统由中医师参与设计，界面跟随「挂号 → 看诊 → 开方 → 收费 → 打印」的真实流程，不用记指令。手机、电脑都可以用浏览器打开，并可一键添加到主屏幕，如同 App 一样使用。架设时会提供设置及操作教学，日常使用有技术支持跟进。',
    'faq.q4': '使用之后会不会突然加价？',
    'faq.a4': '收费很简单：一次性架设费 ＋ 每年年费，年费已包括服务器、系统更新、维护及技术支持。如下一年度需要调整价格，我们会提前不少于 30 日通知现有客户，客户可自行决定是否续约，现有年度合约期内不会单方面加价。',
    'faq.q5': '数据可以随时导出吗？如果将来不用了怎么办？',
    'faq.a5': '可以。系统每日自动云端备份，管理员也可随时手动下载完整备份文件（gzip 压缩），并可导入还原；患者、看诊、处方及收费记录均属于诊所。终止服务后，您可以在合理时间内索取及导出全部资料，备份也会按周期轮替清除。',

    'final.title': '准备好让您的诊所<br><span class="text-gradient">迈向数字化了吗？</span>',
    'final.p': '立即联系我们，了解更多详情',

    'footer.logoalt': '名医诊所系统 Logo',
    'footer.about': '专为中医诊所量身打造的智慧管理系统<br>简便 · 易用 · 高效',
    'footer.products': '产品功能',
    'footer.f1': '在线预约',
    'footer.f2': '智能问诊',
    'footer.f3': '穴位地图',
    'footer.f4': '视频看诊',
    'footer.f5': '药材数据库',
    'footer.f6': '常见问题',
    'footer.contact': '联系我们',
    'footer.copy': '© 2025 名医诊所系统. All rights reserved.',
    'footer.privacy': '隐私政策',
    'footer.terms': '服务条款',

    'wa.float': 'WhatsApp 咨询名医诊所系统',

    'meta.title': '名医诊所系统 | 香港中医诊所管理系统 (TCM Clinic System) - 专为中医量身打造',
    'meta.desc': '名医诊所系统提供专业的中医诊所管理解决方案，包含在线预约、智能问诊、电子病历、中药库存及针灸穴位地图。由中医师亲自参与设计，专为香港诊所打造，贴合真实看诊流程。',
    'meta.ogtitle': '名医诊所系统 | 香港中医诊所管理系统',
    'meta.ogdesc': '名医诊所系统提供专业的中医诊所管理解决方案，包含在线预约、智能问诊、电子病历、中药库存及针灸穴位地图。'
  };

  /* ---------------- English ---------------- */
  var en = {
    'nav.features': 'Features',
    'nav.pwa': 'PWA App',
    'nav.tcm': 'TCM Features',
    'nav.tele': 'Telemedicine',
    'nav.att': 'Attachments',
    'nav.backup': 'Backup',
    'nav.member': 'Membership',
    'nav.security': 'Security',
    'nav.pricing': 'Pricing',

    'cta.contact': 'Contact Us',
    'cta.demo': '🗓️ Book a 15-min Online Demo',
    'cta.wa': '📞 Chat on WhatsApp',
    'cta.wa.long': '📞 WhatsApp: +852 54393401',

    'hero.badge': 'Tailor-made for TCM Clinics',
    'hero.title': 'MingYI Clinic System: A Complete Digital Management Solution for Hong Kong TCM Clinics',
    'hero.subtitle': 'Simple · Intuitive · Efficient',
    'hero.desc': 'Combining thousand-year TCM wisdom with modern technology — fully digitalising everything from the "Four Examinations" to "Syndrome Differentiation and Treatment"',
    'hero.designer': 'A TCM clinic system designed by TCM practitioners — built around real TCM needs',
    'hero.stat.stable': 'System uptime',
    'hero.stat.time': 'Consultation time saved',

    'feat.tag': 'Complete Feature Modules',
    'feat.title': 'A Perfect Closed Loop for Clinic Operations',
    'feat.sub': 'From front-desk registration to back-office management — everything in one platform',

    'f1.t': 'Online Appointment & Registration',
    'f1.d': 'Patients can book online 24/7 via phone or computer, freely choosing practitioner and time slot; the clinic schedule updates automatically.',
    'f2.t': 'Smart Intake Questionnaire',
    'f2.d': 'A digital "Ten Questions" assessment: a 12-step guided questionnaire covering cold/heat, sweating, digestion, sleep and more, completing a preliminary constitution review while patients wait.',
    'f3.t': 'Electronic Medical Records',
    'f3.d': 'A complete patient database with record search, history tracking and quick-insert diagnosis templates — letting practitioners focus on care.',
    'f4.t': 'Scheduling & Reports',
    'f4.d': 'Visual staff scheduling, revenue analytics and patient-source tracking for precise, data-driven decisions.',
    'f5.t': 'Pharmacy Inventory Management',
    'f5.d': 'Full inbound/outbound stock tracking for Chinese herbs, automatic low-stock alerts and auto-deduction when prescriptions are issued.',
    'f6.t': 'Custom Preset Combinations',
    'f6.d': 'Save each practitioner\'s go-to herbal formula combinations and acupoint pairings — prescribing speed improves by over 50%.',
    'f7.t': 'Package & Treatment Plans',
    'f7.d': 'Flexible treatment packages (e.g. 10-session acupuncture pass, monthly tuina card) with automatic session deduction and expiry management, boosting return visits.',
    'f8.t': 'Multi-Clinic Management',
    'f8.d': 'Built for clinic chains: switch between branches with one click and centrally manage records and revenue across all locations.',
    'f9.t': 'Financial Reports',
    'f9.d': 'Auto-generated daily/monthly/quarterly reports detailing registration, herbal medicine and consultation fees — revenue at a glance.',
    'f10.t': 'Legacy Data Migration',
    'f10.d': 'Import JSON/CSV from your old clinic system: parse and preview first, then migrate; patient profiles are automatically matched and de-duplicated, and records linked to the right patient.',
    'f11.t': 'Backup & Restore',
    'f11.d': 'Automatic daily cloud backups; archives are compressed and encrypted. Admins can sync manually at any time and restore with one click — your valuable medical data is always safe.',
    'f12.t': 'Clinic User Management',
    'f12.d': 'Fine-grained role-based access for practitioners, nurses and reception staff — protecting your data.',
    'f13.t': 'You Own Your Data',
    'f13.d': 'All clinic data stays under your own control — safe and confidential.',
    'f14.t': 'Continuous Improvement',
    'f14.d': 'The system keeps receiving updates and new features to continually improve the experience.',

    'ss.tag': 'Interface Preview',
    'ss.title': 'An Intuitive, Easy-to-Use Experience',
    'ss.sub': 'A thoughtfully designed interface your team can master without lengthy training',
    'ss.alt1': 'MingYI Clinic System – TCM registration and waiting-list management interface',
    'ss.alt2': 'Interactive acupoint map and meridian locator in the TCM system',
    'ss.alt3': 'Automated Chinese herb inventory management and materia medica database',
    'ss.alt4': 'MingYI Clinic System – staff scheduling synced across multiple clinics',
    'ss.t1': 'Efficient Registration & Consultation',
    'ss.d1': 'A clear waiting list with real-time status management',
    'ss.t2': 'Interactive Acupoint Map',
    'ss.d2': 'Visual meridian locating for precise treatment',
    'ss.t3': 'Smart Herbal Pharmacy',
    'ss.d3': 'Detailed herb properties with automatic stock alerts',
    'ss.t4': 'Professional Scheduling',
    'ss.d4': 'Clear staff rosters synced across multiple clinics',

    'pwa.tag': 'PWA — Progressive Web App',
    'pwa.title': 'No App Download Needed — Install on Phone & Computer',
    'pwa.sub': 'Just open the browser and "Add to Home Screen". Once installed it launches full-screen without an address bar; with push notifications and offline caching, it feels just like a native app — without the App Store hassle.',
    'pwa.1t': 'One-Tap Add to Home Screen',
    'pwa.1d': 'Installable on iPhone, Android and Mac. It launches full-screen with no browser address bar and adds a dedicated icon to your desktop — like a custom-built clinic app.',
    'pwa.2t': 'Instant Push Notifications',
    'pwa.2d': 'While using the system, waiting-patient alerts, completed consultations and channel/chat messages are pushed instantly to phone and computer; they stop automatically after logout — no off-hours disturbance.',
    'pwa.3t': 'Works Offline',
    'pwa.3d': 'Open the system and cached content even on an unstable or fully offline network; data syncs automatically once reconnected, so operations are never interrupted.',
    'pwa.4t': 'Opens in Seconds',
    'pwa.4d': 'The Service Worker pre-caches the interface and resources, so the second launch is nearly instant — smooth even on older phones.',
    'pwa.5t': 'Always Up to Date',
    'pwa.5d': 'Updates happen automatically in the background — no manual app-store upgrades. Every launch brings the latest features.',
    'pwa.6t': 'Tiny Footprint · Zero Ads',
    'pwa.6d': 'Takes minimal space, needs few permissions, bypasses app-store review and contains no third-party advertising.',
    'pwa.stepst': 'Install in Three Steps',
    'pwa.ip1': '1. Open your clinic URL in <strong>Safari</strong>',
    'pwa.ip2': '2. Tap the "Share" button at the bottom (box with up arrow ⬆️)',
    'pwa.ip3': '3. Choose "Add to Home Screen"',
    'pwa.an1': '1. Open your clinic URL in Chrome',
    'pwa.an2': '2. Tap the menu at the top right (three dots)',
    'pwa.an3': '3. Choose "Add to Home screen" or "Install app"',
    'pwa.pc1': '1. Open the URL in Chrome or Edge',
    'pwa.pc2': '2. Click the install icon at the right of the address bar',
    'pwa.pc3': '3. Confirm to finish — push notifications are supported on Mac too',

    'tcm.tag': 'Exclusive TCM Features',
    'tcm.title': 'Carrying Forward Ancient Wisdom',
    'tcm.sub': 'A clinic system deeply integrated with professional TCM knowledge',
    'tcm.1t': 'Digital Materia Medica',
    'tcm.1s': 'Complete Chinese herb database',
    'tcm.1l1': 'Built-in data on the <strong class="text-white">nature, flavour and meridian entry</strong> of hundreds of herbs',
    'tcm.1l2': 'Each herb\'s <strong class="text-white">actions, indications and contraindications</strong>, with automatic "eighteen clashes / nineteen antagonisms" alerts',
    'tcm.1l3': 'Built-in <strong class="text-white">classical formula templates</strong> (Gui Zhi Tang, Liu Wei Di Huang Wan…) — recall and modify with one tap',
    'tcm.2t': 'Interactive Acupoint Map',
    'tcm.2s': 'A powerful aid for acupuncture',
    'tcm.2l1': 'Precise locations for <strong class="text-white">hundreds of acupoints</strong> (Baihui, Zusanli, Hegu…)',
    'tcm.2l2': 'Visual meridian charts with a <strong class="text-white">magnifier function</strong> for details',
    'tcm.2l3': 'Automatic <strong class="text-white">Traditional↔Simplified Chinese conversion</strong> for clinics across Greater China',
    'tcm.3t': 'Syndrome Differentiation Aid',
    'tcm.3s': 'Standardised clinical workflow',
    'tcm.3l1': 'A built-in <strong class="text-white">diagnosis template library</strong> covering common patterns (Liver-Qi stagnation, Spleen-Kidney Yang deficiency…)',
    'tcm.3l2': '<strong class="text-white">Smart diagnostic suggestions</strong> based on entered symptoms',
    'tcm.3l3': 'Record <strong class="text-white">pulse and tongue findings</strong> — complete Four Examinations documentation',
    'tcm.4t': 'Constitution Analysis Questionnaire',
    'tcm.4s': 'Digitalising the "Inquiry" examination',
    'tcm.4l1': '<strong class="text-white">Cold/Heat assessment:</strong> aversion to cold/heat and cold-limb evaluation',
    'tcm.4l2': '<strong class="text-white">Excretion review:</strong> urine colour and stool form analysis',
    'tcm.4l3': '<strong class="text-white">Sweating analysis:</strong> spontaneous vs. night sweats (Yin/Yang deficiency indicators)',

    'tele.tag': 'Global-Network Video Consultation',
    'tele.title': 'Built-In Video Consultations',
    'tele.sub': 'A global real-time network (SD-RTN™) automatically selects the optimal route, so overseas and cross-border patients still enjoy smooth HD consultations.',
    'tele.h3': 'Wherever the patient is, the consultation room is there too',
    'tele.p': 'Purpose-built for Hong Kong TCM practice: practitioners open a dedicated consultation room with one click inside the clinical system, seamlessly connected to EMR and prescriptions. Whether patients are in Hong Kong, Mainland China or overseas, they just open the room link to meet their practitioner face to face.',
    'tele.l1': '<strong style="color: #1E1E1E;">Smart global routing:</strong> nodes worldwide connect patients via the nearest, best route — low-latency cross-border calls without stuttering.',
    'tele.l2': '<strong style="color: #1E1E1E;">Adaptive HD quality:</strong> resolution adjusts automatically to the network for stable calls over Wi‑Fi or 4G/5G.',
    'tele.l3': '<strong style="color: #1E1E1E;">E-consent + encrypted transmission:</strong> patients sign an electronic consent form (auto-archived) before entering; the session is fully encrypted to protect both parties\' privacy.',
    'tele.c1t': 'Global Nodes, Smart Routing',
    'tele.c1d': 'Worldwide real-time nodes select the optimal route by patient location — local access with low cross-border latency.',
    'tele.c2t': 'One Link, No App Needed',
    'tele.c2d': 'Patients simply open the consultation-room link in a browser — no download, installation or login required.',
    'tele.c3t': 'E-Consent, Privacy Assured',
    'tele.c3d': 'Consent must be read and signed before entry; time and version are archived automatically. Video is encrypted and unauthorised recording is prohibited.',
    'tele.c4t': 'Weak-Network Adaptation & Reconnect',
    'tele.c4d': 'Quality auto-adjusts for stable 4G/5G/Wi‑Fi calls; network switches or brief drops recover automatically — no need to re-register.',

    'att.tag': 'Medical Report Management',
    'att.title': 'Tongue-Image Gallery & Medical Reports',
    'att.sub': 'Tongue photos and medical reports (check-up reports, scan images) are captured and uploaded instantly, auto-filed into the corresponding visit record',
    'att.h3': 'Every image is tied to a consultation',
    'att.p': 'Tongue photos taken during consultations and reports/images submitted by patients upload instantly and link automatically to that visit\'s record. Images appear as thumbnails; click to view the full file, with upload timestamps. Practitioners can review past tongue images to track treatment progress at a glance.',
    'att.l1': '<strong style="color: #1E1E1E;">Auto-filed by visit:</strong> photos uploaded in the consultation screen or patient profile are filed into that visit\'s record, with thumbnails under the chief complaint and tongue shots in the tongue field.',
    'att.l2': '<strong style="color: #1E1E1E;">Multiple capture methods:</strong> webcam capture, file selection, or phone capture via a time-limited QR code; during video calls, grab the patient\'s tongue image with one click.',
    'att.l3': '<strong style="color: #1E1E1E;">Tongue history comparison:</strong> all tongue photos are gathered chronologically, while medical reports and tongue images are organised together — neat and clear.',
    'att.l4': '<strong style="color: #1E1E1E;">Secure & compliant:</strong> images upload directly to cloud storage via time-limited signed URLs — never relayed through clinic servers, fully encrypted; only the uploader and admins can delete, and every action is logged.',
    'att.c1t': 'Tongue History Records',
    'att.c1d': 'Tongue photos from each visit are categorised for quick thumbnail browsing and full-image comparison of tongue body and coating.',
    'att.c2t': 'Phone QR-Code Capture',
    'att.c2d': 'A time-limited QR code on screen opens the camera on any phone — no login needed; photos return automatically to the current record.',
    'att.c3t': 'One-Click Video Snapshot',
    'att.c3d': 'Capture the patient\'s image during a video call; after preview, it is saved instantly as a tongue image in the current record.',
    'att.c4t': 'Direct, Encrypted Upload',
    'att.c4d': 'Signed-URL cloud object storage bypasses servers with end-to-end encryption; thumbnails are generated automatically for fast, bandwidth-friendly viewing.',

    'bk.tag': 'Automatic Cloud Backup',
    'bk.title': 'Daily Automatic Cloud Backups — Medical Data You Can Rely On',
    'bk.sub': 'Data syncs automatically to the cloud: incremental syncs daily, with a full comparison every 7 days; encrypted archives are retained for two months, and admins can sync, download and restore at any time.',
    'bk.s1n': 'Daily',
    'bk.s1d': 'Scheduled automatic backups',
    'bk.s2n': '7 days',
    'bk.s2d': 'Automatic full comparison',
    'bk.s3n': '2 months',
    'bk.s3d': 'Archives automatically retained',
    'bk.c1t': 'Weekly Full Comparison',
    'bk.c1d': 'Seven days after the last full baseline, a complete re-read runs automatically, naturally excluding deleted files so cloud backups match current data exactly.',
    'bk.c2t': 'Snapshot Merge & Assembly',
    'bk.c2d': 'The latest full snapshots are consolidated in the cloud and assembled after each sync into a backward-compatible archive — patients, records, charges and packages, all included.',
    'bk.c3t': 'gzip Compression',
    'bk.c3d': 'Backup JSON is gzip-compressed, typically shrinking medical data 5–10× — saving cloud storage and making downloads quick even on mobile networks.',
    'bk.c4t': 'Import & One-Click Restore',
    'bk.c4d': 'Restore clinic data by importing an archive; admins can also sync manually or run a full comparison to immediately correct changes and deletions.',
    'bk.ch1': 'Admin-only operation',
    'bk.ch2': 'Transparent sync status',
    'bk.ch3': 'Two-month retention',
    'bk.ch4': 'Automatic cleanup of expired backups',

    'mb.tag': 'Membership Stored-Value System',
    'mb.title': 'Stored Value · Top-Up Rewards · Self-Service Inquiries',
    'mb.sub': 'A complete membership system spanning stored-value accounts, member discounts, in-consultation payment and patient self-service inquiries — encouraging prepayment and return visits, with every transaction fully traceable.',
    'mb.h3': 'One account linking the consultation room and the patient',
    'mb.p': 'The membership system is built around a <strong style="color: #1E1E1E;">stored-value account</strong>: after topping up at the clinic, principal and bonus amounts are tracked separately; consultation fees can be paid directly from the balance, and active members automatically receive the clinic\'s standard discount. Patients can check balance, active packages and transactions anytime using their registered mobile number.',
    'mb.l1': '<strong style="color: #1E1E1E;">Principal/bonus separated:</strong> tiered top-up rewards with clinic-defined rules (e.g. top up HK$1,000, get HK$50); the server calculates bonuses and the deduction order is configurable (bonus first by default).',
    'mb.l2': '<strong style="color: #1E1E1E;">Automatic member discounts:</strong> when active members with a balance open a consultation bill, the clinic-defined discount is applied automatically — staff can remove it case by case.',
    'mb.l3': '<strong style="color: #1E1E1E;">No double charges:</strong> payment runs only when the record is completed, and every bill has a unique ID so network retries never double-charge; failed payments keep the record and can be retried; refunds restore principal and bonus proportionally.',
    'mb.l4': '<strong style="color: #1E1E1E;">Self-service via mobile:</strong> patients enter their registered mobile number and pass a CAPTCHA — no account or password; Chinese/English supported, multiple patients per number (family sharing), clinics shown separately, and only balances/packages/transactions are displayed — never medical records.',
    'mb.mock.title': 'Member Inquiry',
    'mb.mock.bal': 'Total stored balance (HKD)',
    'mb.mock.principal': 'Principal balance',
    'mb.mock.bonus': 'Bonus balance',
    'mb.mock.tickets': 'Active packages',
    'mb.mock.tname': '10-Session Acupuncture Pass',
    'mb.mock.remain': '7 sessions left',
    'mb.mock.recent': 'Recent transactions',
    'mb.mock.tr1': 'Top-up',
    'mb.mock.tr2': 'Top-up bonus',
    'mb.mock.tr3': 'Consultation charge',
    'mb.mock.note': 'Member inquiry page illustration (figures shown for demonstration only)',
    'mb.c1t': 'Independent Account per Clinic',
    'mb.c1d': 'Each clinic\'s patients get independent accounts with principal and bonus tracked separately to the exact HK$0.01; accounts can be frozen/reactivated and cannot be closed while holding a balance.',
    'mb.c2t': 'Tiered Top-Up Rewards',
    'mb.c2d': 'Define multi-level rewards (e.g. top up HK$1,000, get HK$50); the server matches and calculates automatically — front desks cannot alter it. Cash, FPS, EPS, credit card and cheque accepted.',
    'mb.c3t': 'Automatic Member Discounts',
    'mb.c3d': 'Discounts follow existing clinic charge items and appear on the bill automatically for active members — no manual entry or memorisation needed, and they can be removed flexibly.',
    'mb.c4t': 'Balance Payments & Refund Controls',
    'mb.c4d': 'Settle from stored value in one tick (bonus first, then principal) with instant low-balance prompts; refunds and manual adjustments are admin-only, and every top-up, charge and refund leaves a permanent audit trail.',
    'mb.c5t': 'Self-Service by Mobile Number',
    'mb.c5d': 'Patients enter their registered number and pass a CAPTCHA — no login needed; dual IP and phone-number rate limiting prevents enumeration and protects privacy.',
    'mb.c6t': 'Integrated Financial Reports',
    'mb.c6d': 'Top-up principal is booked as member prepayment (not revenue) and consumption is offset automatically; reports include a dedicated stored-value section with daily detail, and accounts/trials are included in daily cloud backups.',
    'mb.ch1': 'Complete top-up and deduction audit trail',
    'mb.ch2': 'Multiple family patients per phone number',
    'mb.ch3': 'Independent accounts shown per clinic',
    'mb.ch4': 'Package balance and expiry visible together',
    'mb.ch5': 'Bilingual Chinese/English interface',
    'mb.ch6': 'Account freeze and reactivation',

    'sec.tag': 'Security & Technology',
    'sec.title': 'Enterprise-Grade Security',
    'sec.sub': 'Built on the industry\'s highest security standards to protect your clinic and patient data',
    'sec.1t': 'Web Application Firewall',
    'sec.1d': 'WAF blocks malicious attacks',
    'sec.2t': 'Encrypted Cloud Storage',
    'sec.2d': 'TLS/SSL in transit + encryption at rest',
    'sec.3t': 'Authentication',
    'sec.3d': 'Multi-factor verification and secure credential storage',
    'sec.4t': 'Dedicated Databases',
    'sec.4d': 'Independent database per clinic for stronger confidentiality',
    'sec.i1t': 'Global CDN',
    'sec.i1d': 'Content cached at global nodes for blazing-fast access',
    'sec.i2t': 'Cross-Platform',
    'sec.i2d': 'Smooth on desktop, tablet and mobile',
    'sec.i3t': 'Auto Scaling',
    'sec.i3d': 'Automatic capacity expansion during traffic peaks',
    'sec.i4t': 'Custom Domain',
    'sec.i4d': 'Use your clinic\'s own web address',
    'sec.i5t': 'Real-Time Sync',
    'sec.i5d': 'Registration lists update instantly — no patient missed',
    'sec.i6t': 'Homepage Design',
    'sec.i6d': 'Includes a professional clinic website design',

    'pr.tag': 'Pricing',
    'pr.title': 'Simple, Transparent Pricing — Comprehensive Service at an Affordable Rate',
    'pr.sub': 'One-time setup fee + annual maintenance fee — no hidden charges',
    'pr.basic.name': 'Basic Plan',
    'pr.basic.desc': 'For a single clinic · 1 clinic included',
    'pr.pro.name': 'Advanced Plan',
    'pr.pro.desc': 'For multi-clinic or chain operations · up to 5 clinics · includes clinic homepage design and custom domain',
    'pr.setup': 'Clinic System Setup Fee',
    'pr.once': 'One-time fee',
    'pr.yearly': 'Clinic System Annual Fee',
    'pr.peryear': 'Annual fee',
    'pr.year': '/year',
    'pr.badge': 'Maintenance included',
    'pr.b1': 'Server setup',
    'pr.b2': 'Clinic system configuration',
    'pr.b3': '1 clinic',
    'pr.b4': 'Server hosting',
    'pr.b5': 'System updates and maintenance',
    'pr.b6': 'Technical support',
    'pr.p1': 'Clinic homepage design and setup',
    'pr.p2': 'SEO (Search Engine Optimisation)',
    'pr.p3': 'Custom domain',
    'pr.p4': 'System configuration (up to 5 clinics)',
    'pr.p5': 'Server traffic upgrade',
    'pr.p6': 'Custom domain hosting',
    'pr.p7': 'System updates and maintenance (5 clinics)',

    'faq.tag': 'FAQ',
    'faq.title': 'Questions TCM Clinics Ask Most',
    'faq.sub': 'Still have questions? WhatsApp us, or book a 15-minute online demo to experience it yourself',
    'faq.q1': 'Can our handwritten/Excel records be migrated into the system?',
    'faq.a1': 'Yes. The built-in legacy migration tool supports bulk import of patient profiles and past consultation records via spreadsheets. During setup we help verify fields and run sample checks, so your transition from paper, Excel or other software loses nothing and requires no re-entry. After migration, all records are fully viewable in patient profiles just like new visits.',
    'faq.q2': 'Is patient data secure? Does it comply with the Personal Data (Privacy) Ordinance?',
    'faq.a2': 'The system is designed around the Data Protection Principles of Hong Kong\'s PDPO: only data needed for consultations and operations is collected; transfers are encrypted; records and attachments reside in access-controlled cloud storage; staff accounts have role-based permissions; and the public inquiry page uses CAPTCHA plus dual IP/phone rate-limiting. The clinic owns the patient data — we never sell it or use it for marketing. See our <a href="/privacy" style="color: #B8621F; text-decoration: underline;">Privacy Policy</a> for details.',
    'faq.q3': 'I\'m not good with computers — can I still use it?',
    'faq.a3': 'The system was co-designed with TCM practitioners, and the interface follows the real workflow: "Registration → Consultation → Prescribe → Charge → Print" — no commands to memorise. It runs in any browser on phone or computer and can be added to the home screen like an app. Setup includes configuration and training, and technical support is on hand for daily use.',
    'faq.q4': 'Will the price suddenly increase after we start using it?',
    'faq.a4': 'Pricing is simple: a one-time setup fee plus an annual fee covering hosting, updates, maintenance and support. If prices change for the following year, existing clients receive at least 30 days\' notice and can decide whether to renew — there are no unilateral increases during an active annual contract.',
    'faq.q5': 'Can data be exported anytime? What if we stop using the system later?',
    'faq.a5': 'Yes. There are automatic daily cloud backups, and admins can download a complete gzip archive at any time and import it to restore; patients, consultations, prescriptions and charges all belong to the clinic. After termination, you can request and export all data within a reasonable period, and backups are purged on a rotating schedule.',

    'final.title': 'Ready to take your clinic<br><span class="text-gradient">into the digital era?</span>',
    'final.p': 'Contact us now to learn more',

    'footer.logoalt': 'MingYI Clinic System Logo',
    'footer.about': 'A smart management system tailor-made for TCM clinics<br>Simple · Intuitive · Efficient',
    'footer.products': 'Product',
    'footer.f1': 'Online Booking',
    'footer.f2': 'Smart Intake',
    'footer.f3': 'Acupoint Map',
    'footer.f4': 'Video Consultation',
    'footer.f5': 'Herb Database',
    'footer.f6': 'FAQ',
    'footer.contact': 'Contact Us',
    'footer.copy': '© 2025 MingYI Clinic System. All rights reserved.',
    'footer.privacy': 'Privacy Policy',
    'footer.terms': 'Terms of Service',

    'wa.float': 'Chat with MingYI Clinic System on WhatsApp',

    'meta.title': 'MingYI Clinic System | Hong Kong TCM Clinic Management Software - Built for TCM Practitioners',
    'meta.desc': 'MingYI Clinic System offers a professional TCM clinic management solution: online booking, smart intake questionnaires, electronic medical records, herbal pharmacy inventory and an acupoint map. Designed with practising TCM practitioners for Hong Kong clinics.',
    'meta.ogtitle': 'MingYI Clinic System | Hong Kong TCM Clinic Management System',
    'meta.ogdesc': 'A professional TCM clinic management solution with online booking, smart intake, EMR, herbal inventory and an interactive acupoint map.'
  };

  var DICTS = { 'zh-CN': zhCN, 'en': en };
  var ATTR_MAP = {
    'data-i18n-alt': 'alt',
    'data-i18n-placeholder': 'placeholder',
    'data-i18n-title': 'title',
    'data-i18n-aria-label': 'aria-label'
  };

  /* zh-HK 原文於首次載入時由 DOM 快照取得，無需在字典重覆維護 */
  var originals = {};

  function snapshotOriginals() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (!originals[k]) originals[k] = {};
      originals[k].text = el.textContent;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-html');
      if (!originals[k]) originals[k] = {};
      originals[k].html = el.innerHTML;
    });
    Object.keys(ATTR_MAP).forEach(function (attr) {
      document.querySelectorAll('[' + attr + ']').forEach(function (el) {
        var k = el.getAttribute(attr);
        if (!originals[k]) originals[k] = {};
        originals[k][ATTR_MAP[attr]] = el.getAttribute(ATTR_MAP[attr]);
      });
    });

    /* meta.* 鍵不在 DOM 上（由 applyMeta 直接套用），需獨立快照繁中原文 */
    originals['meta.title'] = { text: document.title };
    var metaDesc = document.querySelector('meta[name="description"]');
    var ogTitle = document.querySelector('meta[property="og:title"]');
    var ogDesc = document.querySelector('meta[property="og:description"]');
    originals['meta.desc'] = { text: metaDesc ? metaDesc.getAttribute('content') : '' };
    originals['meta.ogtitle'] = { text: ogTitle ? ogTitle.getAttribute('content') : '' };
    originals['meta.ogdesc'] = { text: ogDesc ? ogDesc.getAttribute('content') : '' };
  }

  function lookup(lang, key, mode) {
    if (lang === 'zh-HK') {
      var o = originals[key];
      return o ? (mode === 'html' ? o.html : o[mode]) : null;
    }
    var dict = DICTS[lang] || {};
    if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[i18n] missing key "' + key + '" for ' + lang);
    }
    var fb = originals[key];
    return fb ? (mode === 'html' ? fb.html : fb[mode]) : null;
  }

  function applyMeta(lang) {
    var title = lookup(lang, 'meta.title', 'text');
    var desc = lookup(lang, 'meta.desc', 'text');
    var ogTitle = lookup(lang, 'meta.ogtitle', 'text');
    var ogDesc = lookup(lang, 'meta.ogdesc', 'text');
    if (title) document.title = title;
    setMeta('meta[name="description"]', 'content', desc);
    setMeta('meta[property="og:title"]', 'content', ogTitle);
    setMeta('meta[property="og:description"]', 'content', ogDesc);
  }

  function setMeta(selector, attr, value) {
    if (!value) return;
    var el = document.querySelector(selector);
    if (el) el.setAttribute(attr, value);
  }

  function updateChrome(lang) {
    document.documentElement.lang = lang;

    var current = document.getElementById('lang-current');
    if (current) current.textContent = LANG_LABEL[lang] || lang;

    document.querySelectorAll('#lang-dropdown [data-lang]').forEach(function (btn) {
      btn.setAttribute('aria-current', btn.getAttribute('data-lang') === lang ? 'true' : 'false');
    });

    document.querySelectorAll('#mobile-menu [data-lang]').forEach(function (btn) {
      var active = btn.getAttribute('data-lang') === lang;
      btn.style.borderColor = active ? '#D9782B' : '#E8DED5';
      btn.style.color = active ? '#B8621F' : '#555';
    });
  }

  function applyLanguage(lang) {
    if (SUPPORTED.indexOf(lang) === -1) lang = 'zh-HK';

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var v = lookup(lang, el.getAttribute('data-i18n'), 'text');
      if (v !== null && v !== undefined) el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var v = lookup(lang, el.getAttribute('data-i18n-html'), 'html');
      if (v !== null && v !== undefined) el.innerHTML = v;
    });
    Object.keys(ATTR_MAP).forEach(function (dataAttr) {
      var realAttr = ATTR_MAP[dataAttr];
      document.querySelectorAll('[' + dataAttr + ']').forEach(function (el) {
        var v = lookup(lang, el.getAttribute(dataAttr), realAttr);
        if (v !== null && v !== undefined) el.setAttribute(realAttr, v);
      });
    });

    applyMeta(lang);
    updateChrome(lang);
  }

  function detectLang() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
    } catch (e) { /* localStorage 不可用時忽略 */ }

    var nav = navigator.language || navigator.userLanguage || 'zh-HK';
    var l = nav.toLowerCase();
    if (l.indexOf('zh') === 0) {
      if (l.indexOf('cn') !== -1 || l.indexOf('hans') !== -1 || l.indexOf('sg') !== -1) return 'zh-CN';
      return 'zh-HK';
    }
    if (l.indexOf('en') === 0) return 'en';
    return 'zh-HK';
  }

  function setLanguage(lang, persist) {
    if (SUPPORTED.indexOf(lang) === -1) lang = 'zh-HK';
    applyLanguage(lang);
    if (persist !== false) {
      try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* ignore */ }
    }
    var btn = document.getElementById('lang-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    var dd = document.getElementById('lang-dropdown');
    if (dd) dd.classList.add('hidden');
  }

  function initDropdown() {
    var btn = document.getElementById('lang-btn');
    var dd = document.getElementById('lang-dropdown');
    if (!btn || !dd) return;

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = dd.classList.toggle('hidden') === false;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    dd.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    document.addEventListener('click', function () {
      if (!dd.classList.contains('hidden')) {
        dd.classList.add('hidden');
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !dd.classList.contains('hidden')) {
        dd.classList.add('hidden');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function init() {
    snapshotOriginals();
    initDropdown();

    document.querySelectorAll('[data-lang]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setLanguage(btn.getAttribute('data-lang'));
      });
    });

    setLanguage(detectLang(), false);
  }

  window.landingI18n = { setLanguage: setLanguage, detectLang: detectLang };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
