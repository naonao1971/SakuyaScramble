// 傾き(ジャイロ)操作。起動時の持ち方を基準(0)にし、そこからの傾きを -1..1 にする。
//
// beta/gamma をそのまま軸の入れ替えで使うと、横持ちで画面を立てて構える姿勢が
// gamma の定義域の端に当たり、オイラー角の特異点(ジンバルロック)に入る。
// そこで重力ベクトルを求めてから画面の向きに合わせて回す方式にしている。
export function createGyro({ input, status, onActiveChange }) {
  const gyro = {
    supported: false, // 実際の傾きデータを一度でも受け取った
    listening: false, // 許可を得てリスナーを付けた
    active: false, // 今、移動に使っている
    calibrated: false,
    baseline: { x: 0, y: 0 },
    deadzoneDeg: 4,
    maxDeg: 28,
    userChoiceMade: false, // トグルを触った後は、スタート時に自動で切り替えない
  };
  let fallbackTimer = null;

  function screenAngle() {
    if (window.screen && window.screen.orientation && typeof window.screen.orientation.angle === "number") {
      return window.screen.orientation.angle;
    }
    if (typeof window.orientation === "number") return window.orientation;
    return 0;
  }

  function computeScreenTilt(beta, gamma) {
    const rad = Math.PI / 180;
    const b = (beta || 0) * rad;
    const g = (gamma || 0) * rad;
    const cB = Math.cos(b), sB = Math.sin(b);
    const cG = Math.cos(g), sG = Math.sin(g);
    // ZXY回転行列の第3行 = 端末座標系で見た鉛直上方向
    const gx = -cB * sG;
    const gy = sB;
    const gz = cB * cG;
    const th = (((screenAngle() % 360) + 360) % 360) * rad;
    const cT = Math.cos(th), sT = Math.sin(th);
    const sx = gx * cT - gy * sT;
    const sy = gx * sT + gy * cT;
    return {
      x: -Math.asin(Math.max(-1, Math.min(1, sx))) / rad,
      y: Math.atan2(sy, gz) / rad,
    };
  }

  function shortestAngleDelta(a, b) {
    let d = (a - b) % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }

  function normalize(deltaDeg) {
    const abs = Math.abs(deltaDeg);
    if (abs <= gyro.deadzoneDeg) return 0;
    const t = Math.min(1, (abs - gyro.deadzoneDeg) / (gyro.maxDeg - gyro.deadzoneDeg));
    return (deltaDeg < 0 ? -1 : 1) * t;
  }

  function recalibrate() {
    gyro.calibrated = false;
  }

  function handleOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    const justConfirmed = !gyro.supported;
    gyro.supported = true;
    if (!gyro.active) return;
    if (justConfirmed) {
      clearTimeout(fallbackTimer);
      onActiveChange(true);
      status("ジャイロ操作中：端末を傾けて移動します（現在の向きが基準）");
    }
    const t = computeScreenTilt(e.beta, e.gamma);
    if (!gyro.calibrated) {
      gyro.baseline.x = t.x;
      gyro.baseline.y = t.y;
      gyro.calibrated = true;
      return;
    }
    input.gyroX = normalize(shortestAngleDelta(t.x, gyro.baseline.x));
    input.gyroY = normalize(shortestAngleDelta(t.y, gyro.baseline.y));
  }

  async function requestPermission() {
    if (typeof window.DeviceOrientationEvent === "undefined") return false;
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      try {
        return (await DeviceOrientationEvent.requestPermission()) === "granted";
      } catch (e) {
        return false;
      }
    }
    return true; // Android・古いiOSは許可不要
  }

  async function ensureListening() {
    if (gyro.listening) return true;
    if (!(await requestPermission())) return false;
    gyro.listening = true;
    window.addEventListener("deviceorientation", handleOrientation);
    // 持ち替えると「水平」の意味が変わるので、回転したら基準を取り直す
    window.addEventListener("orientationchange", recalibrate);
    if (window.screen && window.screen.orientation) {
      window.screen.orientation.addEventListener("change", recalibrate);
    }
    return true;
  }

  // 許可が出ても傾きデータが来ない端末がある(ジャイロ無しのAndroid等)。
  // 実データを受け取るまではスティックを殺さない
  function activate() {
    gyro.active = true;
    input.gyroX = 0;
    input.gyroY = 0;
    recalibrate();
    if (gyro.supported) {
      onActiveChange(true);
      status("ジャイロ操作中：端末を傾けて移動します（現在の向きが基準）");
    } else {
      onActiveChange(false);
      status("ジャイロを確認中...端末を傾けてみてください（反応がなければ画面の左側を押したまま倒して移動してください）");
      clearTimeout(fallbackTimer);
      fallbackTimer = setTimeout(() => {
        if (gyro.active && !gyro.supported) {
          deactivate();
          status("ジャイロが検出できませんでした。画面の左側を押したまま倒して移動してください");
        }
      }, 1500);
    }
  }

  function deactivate() {
    clearTimeout(fallbackTimer);
    gyro.active = false;
    input.gyroX = 0;
    input.gyroY = 0;
    onActiveChange(false);
    status("キー/タッチ操作に切り替えました");
  }

  async function enableIfAvailable() {
    if (await ensureListening()) activate();
  }

  async function toggle() {
    gyro.userChoiceMade = true;
    if (gyro.active) {
      deactivate();
      return;
    }
    if (await ensureListening()) activate();
    else status("ジャイロを有効化できませんでした。キー/タッチで操作してください");
  }

  gyro.recalibrate = recalibrate;
  gyro.enableIfAvailable = enableIfAvailable;
  gyro.toggle = toggle;
  gyro.available = typeof window.DeviceOrientationEvent !== "undefined";
  return gyro;
}
