// 설정
const port = 3000;

// 모듈 임포트
const {
  unlink,
  writeFile,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
} = require("fs");
const { join } = require("path");
const helmet = require("helmet");
const dotenv = require("dotenv");
const express = require("express");
const mongoose = require("mongoose");
const { Captcha } = require("captcha-canvas");

// 몽고DB 모델 임포트
const count_Schema = require("./models/count");

// env 파일 로드
dotenv.config();

// 몽고DB
mongoose.set("strictQuery", true);
mongoose
  .connect(process.env.MONGOOSE, {
    useUnifiedTopology: true,
    useNewUrlParser: true,
  })
  .then(console.log("[DataBase] MONGO DB가 연결되었습니다"));
mongoose.connection.on("reconnected", () => {
  console.log("[DataBase] MONGO DB가 다시 연결되었습니다");
});
mongoose.connection.on("disconnected", () => {
  console.log("[DataBase] MONGO DB의 연결이 끊어졌습니다");
});

// express
const app = express();
app.use(helmet());
app.disable("x-powered-by");

const captchaDir = join(__dirname, "captcha");

// 캡챠 이미지 저장 폴더 생성
if (!existsSync(captchaDir)) {
  mkdirSync(captchaDir);
}

// 캡챠 생성
app.get("/captcha", async (req, res) => {
  const startDate = new Date();

  const canvas = new Captcha();
  canvas.async = true;
  canvas.addDecoy();
  canvas.drawTrace();
  canvas.drawCaptcha();

  const randomEn = generateRandomString(6);

  const filename = `${randomEn}.png`;
  const keyCode = canvas.text;
  const filepath = join(captchaDir, filename);
  const imageFile = await canvas.png;

  writeFile(filepath, imageFile, "binary", function (err) {
    if (err) {
      console.log(err);
    }
  });

  const YearMonthDay = `${startDate.getFullYear()}.${
    startDate.getMonth() + 1
  }.${startDate.getDate()}`;

  const count_find = await count_Schema.findOne({ date: YearMonthDay });

  if (!count_find) {
    await new count_Schema({
      date: YearMonthDay,
      count: 0,
    }).save();
  }

  const endDate = new Date();

  res.status(200).json({
    code: 200,
    note: "캡챠가 생성되었습니다. 3분후에 url이 만료됩니다",
    url: `${req.protocol}://${req.headers.host}/image/${filename.replace(
      ".png",
      ""
    )}`,
    key: `${keyCode}`,
    todayCount: `${(count_find?.count || 0) + 1}`,
    delay: `${endDate - startDate}`,
  });

  await count_Schema.updateOne(
    { date: YearMonthDay },
    {
      $inc: {
        count: 1,
      },
    }
  );
});

// 파일이름에 특수문자가 들어가면 생기는 오류
app.use(function (req, res, next) {
  var err = null;
  try {
    decodeURIComponent(req.path);
  } catch (e) {
    err = e;
  }
  if (err) {
    return res.status(404).json({
      code: 404,
      note: "캡챠 이미지가 3분이 지나 만료되었을 수 있습니다",
    });
  }
  next();
});

// 파일 이름에 영어, 숫자만 들어가도록
app.param("filename", function (req, res, next, filename) {
  if (/^[a-zA-Z0-9]+$/.test(filename)) {
    req.filename = filename;
    next();
  } else {
    res.status(404).json({
      code: 404,
      note: "캡챠 이미지가 3분이 지나 만료되었을 수 있습니다",
    });
  }
});

// 캡챠 이미지 보여주기
app.get("/image/:filename", (req, res) => {
  try {
    const filename = req.params.filename;

    const filepath = join(captchaDir, `${filename}.png`);

    if (existsSync(filepath)) {
      // 이미지 파일이 존재한다면 해당 이미지 파일을 클라이언트에게 전송
      res.sendFile(filepath);
    } else {
      // 이미지 파일이 존재하지 않는다면 404 에러 반환
      res.status(404).json({
        code: 404,
        note: "캡챠 이미지가 3분이 지나 만료되었을 수 있습니다",
      });
    }
  } catch (error) {
    res.status(400).json({
      code: 400,
      note: "Bad Request",
    });
  }
});

// 오류 핸들
app.use(function (err, req, res, next) {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

// 랜덤 파일 이름 만들기 펑션
function generateRandomString(length) {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return result;
}

// 포트 열기
app.listen(port, () => {
  console.log(`[Success] ${port} 포트 개방`);
});

// 만들어진지 3분이 지난 캡챠 이미지는 자동으로 삭제
setInterval(() => {
  const tenMinutesAgo = Date.now() - 3 * 60 * 1000;
  const files = readdirSync(captchaDir);
  files.forEach((file) => {
    const filepath = join(captchaDir, file);
    const stat = statSync(filepath);
    if (stat.mtimeMs < tenMinutesAgo) {
      unlink(filepath, (err) => {
        if (err) {
          console.error(err);
        }
      });
    }
  });
}, 3 * 60 * 1000);

// process 오류 핸들
process.on("uncaughtException", function (err) {
  console.log(err);
});
