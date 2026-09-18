(() => {
  'use strict';

  const point = (x, y) => Object.freeze({ x, y });
  const arm = (shoulder, elbow, wrist, handAngle, open = true) => Object.freeze({
    shoulder: point(...shoulder),
    elbow: point(...elbow),
    wrist: point(...wrist),
    handAngle,
    open
  });

  const poses = [
    {
      id: 'back-crescendo',
      label: '背面 · 展开渐强',
      view: 'back',
      bodyLean: -.035,
      headTilt: -.04,
      left: arm([-34, -162], [-104, -205], [-150, -252], -2.35, true),
      right: arm([34, -162], [101, -205], [142, -262], -.78, true),
      batonHand: 'right',
      batonAngle: -1.72,
      batonLength: 155
    },
    {
      id: 'back-delicate',
      label: '背面 · 精细收拍',
      view: 'back',
      bodyLean: -.11,
      headTilt: -.16,
      left: arm([-31, -157], [-56, -205], [-22, -242], -.6, false),
      right: arm([30, -164], [78, -215], [91, -254], -.95, false),
      batonHand: 'right',
      batonAngle: -.94,
      batonLength: 148
    },
    {
      id: 'back-upbeat',
      label: '背面 · 垂直预备',
      view: 'back',
      bodyLean: -.075,
      headTilt: -.1,
      left: arm([-34, -158], [-91, -185], [-92, -222], -2.2, true),
      right: arm([31, -164], [-4, -205], [-77, -252], -1.7, false),
      batonHand: 'right',
      batonAngle: -1.55,
      batonLength: 158
    },
    {
      id: 'back-grand',
      label: '背面 · 高举全奏',
      view: 'back',
      bodyLean: .025,
      headTilt: .08,
      left: arm([-35, -162], [-112, -206], [-154, -252], -2.45, true),
      right: arm([34, -162], [93, -216], [125, -276], -.73, false),
      batonHand: 'right',
      batonAngle: -.95,
      batonLength: 170
    },
    {
      id: 'front-embrace',
      label: '正面 · 双臂展开',
      view: 'front',
      bodyLean: -.015,
      headTilt: -.025,
      left: arm([-38, -160], [-103, -201], [-136, -255], -2.02, false),
      right: arm([38, -160], [105, -188], [151, -220], -.3, true),
      batonHand: 'left',
      batonAngle: -1.86,
      batonLength: 165
    },
    {
      id: 'front-precision',
      label: '正面 · 轻巧提示',
      view: 'front',
      bodyLean: -.095,
      headTilt: -.12,
      left: arm([-38, -158], [-102, -195], [-139, -230], -2.35, false),
      right: arm([36, -158], [57, -193], [17, -218], -2.25, false),
      batonHand: 'left',
      batonAngle: -2.95,
      batonLength: 164
    }
  ];

  window.SmokeResonanceConductorPoses = Object.freeze(poses.map(pose => Object.freeze(pose)));
})();
