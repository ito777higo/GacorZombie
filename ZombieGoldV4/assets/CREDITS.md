# V4.1 试听配乐

Lightless Dawn — Kevin MacLeod (incompetech.com)。[作者页面](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100655)，[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。用于本地 demo 氛围参考，截取原曲约 32–112 秒，未生成新曲。随包署名与修改说明见 audio/MUSIC_LICENSE.txt。

# 末日版素材来源说明

本版使用用户交付的 49 套 Spine 3.6 素材，当前演员表登记 40 套。文件与动作、角色及未使用项见 docs/素材清单.md，原始来源路径见 assets/spine/catalog.json 与各目录 source.txt。JSON、atlas、PNG 原件保留，二进制转换工具见 tools/skel2json.py。运行库来源与授权原文见 vendor/spine-3.6/。

以下为从 V9.5 带来的历史来源记录，包含已经被换掉或清理的角色；当前发布包不包含旧鱼卡或海豹翻牌图片，实际文件以 tools/manifest.py 为准。此处以下的旧 BGM 记录属于历史版本，当前 V4.1 配乐以上方说明为准。

---

# 美术素材来源

v6 起，游戏里的士兵、僵尸、Boss、跑道道具和鱼使用 Quaternius 的免费模型包。

- 作者：Quaternius（https://quaternius.com）
- 授权：CC0 1.0（公共领域，可免费商用，不要求署名；这里保留署名作为记录）
- 下载：2026-10-19，来自作者官网链接的 Google Drive，只取 glTF 文件，共 47 个
- 处理：`tools/pack_models.py` 去掉不用的动作，转成二进制 `.glb`，放在 `assets/models/`

| 模型包 | 用到的文件 | 在游戏里 |
|---|---|---|
| Toon Shooter Game Kit（2022-12） | Character_Soldier、Character_Enemy；AK、Pistol、Shotgun、RocketLauncher、GrenadeLauncher、ShortCannon；ExplodingBarrel、Barrier_Large、Barrier_Single、SackTrench、Container_Long、Container_Small、Crate、Debris_BrokenCar、Debris_Tires、Tank、TrafficCone、StreetLight、Tree_1 | 我方士兵（重新配色成蓝色）、枪械升级、油桶、公路两边的战场道具 |
| Zombie Apocalypse Kit（2024-03） | Zombie_Basic、Zombie_Chubby、Zombie_Ribcage；Vehicle_Pickup_Armored、Vehicle_Truck_Armored | 尸潮、胖僵尸、Boss「巨尸」、装甲车 |
| Ultimate Monsters（2022-10） | Yeti、Demon | Boss「雪怪」「恶魔」 |
| Animated Mech Pack（2021-03） | George、Leela | Boss「机甲」 |
| Pirate Kit（2023-11） | Characters_Shark、Characters_Tentacle、Enemy_Tentacle；Ship_Small、Environment_Dock、Environment_PalmTree_1、Environment_Rock_2；Prop_Fish_Tuna、Prop_Fish_Mackerel、Prop_Bucket_Fishes、Prop_Chest_Gold、Prop_Coins、Prop_GoldBag、Prop_Cannon | 海上 Boss「海怪」（触手）、渔场里的鲨鱼和小鱼、海上场景 |
| Post Apocalypse Pack（Quaternius，CC0；你提供的 FBX，2026-10-20） | Characters_Shaun、Characters_Lis、Characters_Matt、Characters_Sam、Zombie_Arm、Characters_GermanShepherd；PA_* 道具（集装箱、水塔、红绿灯、路障、垃圾袋、轮胎堆、消防栓、血迹、城镇路牌等） | 4 个幸存者当英雄跑在队伍最前面；大胳膊僵尸当精英怪；德牧是路边伏击的丧尸狗；公路场景道具 |

Post Apocalypse Pack 的 FBX 在本机用 three.js r186 的 FBXLoader + GLTFExporter 转成 GLB（贴图色板用同一套的 Zombie_Atlas.png），再由 `tools/pack_models.py` 合并重复顶点、去掉不用的动作。原始 FBX 放在 `assets/inbox/`（不进 git）。

## Kenney 粒子（v8.1）

- 作者：Kenney（https://kenney.nl），Particle Pack 1.1
- 授权：CC0 1.0（公共领域，可免费商用）
- 来源：2026-10-22 用户放进 `assets/inbox/number-gate-ready/`（不进 git），取 `ready/2d/fx/` 里的 13 张，缩到 128 / 256 像素放在 `assets/fx/`

| 文件 | 在游戏里 |
|---|---|
| star_01、star_04、flare_01 | 箭射中时的白色星形闪光、金币闪光 |
| spark_01、spark_02 | 命中火花、海鳗连锁闪电的电花 |
| scorch_01、scorch_02 | 打死怪、打碎桶、炸弹鱼的爆点 |
| smoke_01、smoke_04 | 爆炸和 Boss 砸地的烟 |
| circle_02 | 冲击环 |
| trace_01、trace_03 | 箭的淡拖影、闪电链 |
| muzzle_02 | 渔场炮台的炮口火光 |

bullet_tracer、muzzle_04 也在（英雄开枪的短曳光和枪口火光）。

## 数字门原型素材包（v8.1，2026-10-22 用户提供，`assets/inbox/number-gate-ready/`，不进 git）

| 文件 | 来源 / 授权 | 在游戏里 |
|---|---|---|
| `assets/models/Characters_Shaun_SingleWeapon.glb`、`Characters_Sam_SingleWeapon.glb` | Quaternius Zombie Apocalypse Kit，CC0；`tools/pack_models.py` 只留 7 个动作 | 皮卡车顶两个持枪英雄 |
| `assets/models/NG_Vehicle_Sports_Armored.glb`、`NG_Vehicle_Truck.glb`、`NG_TrafficCone_2.glb`、`NG_Wheel.glb` | Quaternius，CC0 | 公路两边停的车、路桶、轮胎 |
| `assets/models/NG_gate_gold.glb` | 素材包项目原创占位门框 | 兑换门门框、金砖墙的金库门 |
| 已在项目里的 PA_Chest、PA_Chest_Special、PA_TrafficBarrier_1/2、PA_CinderBlock、PA_Pallet、PA_Pipes、PA_Couch、PA_Barrel、PA_StreetLights（与素材包同款） | Quaternius Post Apocalypse Pack，CC0 | 路上的补给箱（换弩、射速、技能）、墙门路障、公路道具 |
| `assets/ui/*.svg`：pickup_ammo / rifle / speed / squad / shield、icon_drag、icon_boss、health_enemy_frame / fill、finish_line、banner_victory / defeat | 素材包项目原创 | 射速箱图标、升级提示、加速按钮、营救笼、拖动提示、进度条 Boss 标、小 Boss 血条、终点线、结算彩带 |
| `assets/ui/yellow_star.png`、`green_icon_checkmark.png`、`red_icon_cross.png` | Kenney UI Pack 2.0，CC0 | 结算彩带旁的星星、"差一点"里的对错标记 |
| v9：`assets/models/NG_gate_blue.glb`、`NG_gate_green.glb`、`NG_gate_red.glb` | 素材包项目原创占位门框 | 加法门（蓝）、乘法门 / 技能门（绿）、减法门（红）的门框 |
| v9：`assets/ui/*.svg`：pickup_heal、selection_ring_blue、squad_count_plate、health_boss_frame / fill、health_player_frame / fill、progress_track / fill | 素材包项目原创 | 治疗道具图标、护盾光环、队伍兵数牌、Boss 血条框、跑关进度条（health_player 暂未用） |

没有用的：2D 数字门和数字图、地面平铺、按钮皮肤、Kenney 公路块、新枪械模型、Kenney Future 字体（理由见 docs/策划案.md v8.1）。`lastwar-reference-only/` 是 Last War 官网图，只作画面参考，不进游戏。

`vendor/jsm/` 里的 GLTFLoader、SkeletonUtils、BufferGeometryUtils 来自 three.js r160（MIT 协议，https://github.com/mrdoob/three.js），只把 `from 'three'` 改成了项目自己的 `src/three.js`。

## 背景音乐（v9.1，2026-10-23 用户提供，`assets/inbox/10.23/`，不进 git）

| 文件 | 来源 / 授权 | 在游戏里 |
|---|---|---|
| `assets/audio/bgm_short_intro.mp3`（10.23 的 `kartrider_village01_loop_60s.mp3` 原文件） | 用户提供的 Nexon《跑跑卡丁车》村庄曲，来源沿用前版记录 | V3 跑关/撤离背景音乐；从 0 秒开始，60 秒循环；旧 AAC 不进入发布包 |

## 二人捕鱼的美术和逻辑（公司自有，v7 起）

2026-10-21 用户提供的《海豹魔术师》导出包（Unity 工程提取，`assets/inbox/`，不进 git），只取下面这些：

| 来源 | 用到的文件 | 在游戏里 |
|---|---|---|
| `_Resources/Fish_Card_Icon/fishCards/card_fish_<鱼类型>.png`（44 张） | `assets/fish/<鱼类型>.png`（缩到 160×240） | 鱼池和渔场里的鱼（按卡面朝向做成精灵）、翻牌的鱼牌、地图上的渔港 |
| `_Resources/Fish_SealMagician/Model/*.fbx` + `Texture/haibaomoshushi.png` | `assets/models/SealMagician.glb`（three.js FBXLoader 转换，去掉绑骨控制线，贴图转 JPEG） | 第 13 关的 Boss 海豹魔术师（swim / stand01 / stand03 / die 四个动作） |
| `_Resources/Fish_SealMagician/SpriteAtlas`、`Texture` | `assets/magic/`：卡背 `sealCard_Zheng_1~6`、卡面 `sealCard_Fan_1~6`、倍率星 `card_bs`、计分板 `hblff_jfb`、立绘 `hblff_cc_hb`、入场字 `hblff_cc_zi`、标题 `hblff_btzi` | Seal Flip-Flip 翻牌界面和入场字幕，魔术师扔出的卡牌 |
| `seal-magician/`（H5 原始奖励模块，按服务器 `magic_conf.lua` 导出） | `src/magic/seal.js`（只改了 import 路径）、`src/magic/config.js` | 开奖逻辑原样使用：57% ×50，43% 翻 5 张牌（4 张鱼牌之和 × 倍率牌 ×1～×6，最高 ×6000） |
| `Script/BY_Config/BY_FishConfig.lua` | 鱼名和倍数抄进 `src/levels.js` 的 `FISH` | 鱼池和渔场的鱼表 |

这些是公司二人捕鱼项目的资产，只在内部 demo 里使用。
