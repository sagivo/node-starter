"use strict";
const secrets = require('../../config/secrets');
const tesseract = require('node-tesseract');
const im = require('imagemagick');
const path =  require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Call = mongoose.model('Call');
const Err = mongoose.model('Err');
const User = mongoose.model('User');
const Img = mongoose.model('Img');
const acceptable_types = new Set(['pdf', 'bmp', 'pnm', 'png', 'jpg', 'jpeg', 'tiff', 'gif', 'ps', 'webp']);

const upload_name = 'file';
const converted_pdf_format = 'png';
const uploads_path = path.join(__dirname , '/../../uploads');
const request = require('request');
const multer = require('multer');
const upload  = multer({
  fileSize: 4194304, fieldNameSize: 500,
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploads_path);
    },
    filename: function(req, file, cb) {
      cb(null, Date.now() + '-' + file.originalname);
    }
  })
});

exports.ocr = function(req, res){
  console.log('req ocr', req.url);
  if (req.user.monthly_calls_count > 100 && !req.user.card) return res.status(400).json({error: 'Please update your credit card to have more than 100 calls.'});
  //http://i.imgur.com/fYY6P4Y.png | 6mhdcvh7h8pk3xr
  const lang = req.query.lang || 'eng';
  if (req.body.url || req.query.url){
    const file_url = req.body.url || req.query.url;
    console.log('url: ' + file_url);
    const originalname = file_url.split('/').pop().toLowerCase();
    const file_type = file_url.split('.').pop();
    if (!acceptable_types.has(file_type))  {return res.status(400).json({error: 'unsupported file type'}); fs.unlink(req.file.path);}
    const file_path = `${uploads_path}/${Date.now()}-${originalname}`;
    let picStream = request(file_url).pipe(fs.createWriteStream(file_path));
    picStream.on('finish', function() {
      handle_ocr(file_path, req.user.id, res, lang);
    });
  } else {
    upload.single(upload_name)(req, res, (err) => {
      if (!req.file) {handleErr(err); return res.status(400).json({error: 'no file uploaded with file name'});}
      const file_type = req.file.originalname.split('.').pop().toLowerCase();
      if (!acceptable_types.has(file_type)) {return res.status(400).json({error: 'unsupported file type'}); fs.unlink(req.file.path);}
      handle_ocr(req.file.path, req.user.id, res, lang);
    });
  }
}

function handle_ocr(file_path, user_id, res, lang){
  const file_name = file_path.split('/').pop().toLowerCase();
  const file_type = file_name.split('.').pop();
  if (!acceptable_types.has(file_type)) {fs.unlink(file_path); return res.status(400).json({error: 'unsupported file type'});}

  //handle image types
  if (file_type != 'pdf'){
    tesseract.process(file_path, {l: lang}, (err, text) => {
      if (err){handleErr(err); res.status(400).json({error: 'error parsing the image'}); fs.unlink(file_path); return;}
      uploadS3(file_path, user_id, file_name, (err, data) => {
        res.status(200).json({text: text});
        Img.create({user_id: user_id, text: text, url: data.Location}, (err) => {if (err) handleErr(err);} );
        fs.unlink(file_path);
      });
      updateCounts(user_id, 1);
    });
  }

  // //handle image types
  // if (file_type != 'pdf'){
  //   uploadS3(file_path, user_id, file_name, (err, data) => {
  //     if (err){handleErr(err); return res.status(400).json({error: 'error processing the image'});}
  //     microsoftReq(data.Location, (lang == 'eng') ? 'unk' : lang , (err, text) => {
  //       if (err){handleErr(err); return res.status(400).json({error: 'error parsing the image'});}
  //       res.status(200).json({text: text});
  //       Img.create({user_id: user_id, text: text, url: data.Location}, (err) => {if (err) handleErr(err);} );
  //       updateCounts(user_id, 1);
  //     });
  //     fs.unlink(file_path);
  //   });
  // }


  //handle pdf
  else if (file_type == 'pdf'){
    console.log('pdf1');
    pdf2Img(file_name, (err, data)=>{
      console.log('pdf2');
      if (err) {handleErr(err); return res.status(400).json({error: 'error converting pdf to image. please contact us if this error continues.'});}
      const file_names = fs.readdirSync(uploads_path).filter(v=> (v.startsWith(file_name.split('.')[0]) && v.length > file_name.length) || v == file_name.replace('pdf',converted_pdf_format) );
      const docs = new Array(file_names.length);
      let page_counter = 0;
      let err_final = null;
      for (let i=0; i<file_names.length; i++) {
        console.log('pdf3');
        //ocr each file
        const pdf2image_path = path.resolve(uploads_path, file_names[i]);
        tesseract.process(pdf2image_path, {l: lang}, (err, text) => {
          console.log('pdf4');
          if (err) {err_final = err; handleErr(err);}
          else {
            docs[i] = text;
            //upload files to s3, create file in db, delete file in fs
            uploadS3(pdf2image_path, user_id, file_names[i], (err, data) => {
              console.log('pdf5');
              if (err) handleErr(err);
              Img.create({user_id: user_id, text: text, url: data.Location}, (err) => {if(err) handleErr(err);} );
              fs.unlink(pdf2image_path, (err, data) => {if (err) handleErr(err);});
            });
          }
          //final
          if (page_counter++ == file_names.length-1) {
            console.log('pdf6');
            if (err_final) res.status(400).json({error: 'error parsing the pdf. might be because of too many pages or large file. please contact us in case it continues.'});
            else res.status(200).json({text: docs});
            fs.unlink(file_path, (err, data) => {if (err) handleErr(err);});
          }
        });
      }
      updateCounts(user_id, file_names.length);
    });
  }
}

function pdf2Img(file_name, cb){
  im.convert(['-density', '300', `${uploads_path}/${file_name}`, '-quality', '100', '-sharpen', '0x1.0', `${uploads_path}/${file_name.split('.')[0]}.${converted_pdf_format}`], cb);
}

function updateCounts(user_id, pages){
  Call.create({user_id: user_id, name: 'ocr', pages: pages}, (err) => {if(err) handleErr(err);} );
  User.findByIdAndUpdate(user_id, {$inc: {monthly_calls_count: pages}}, (err) => {if(err) handleErr(err);} );
}

const AWS = require('aws-sdk');
const s3 = new AWS.S3({credentials: {accessKeyId: secrets.aws.accessKeyId, secretAccessKey: secrets.aws.secretAccessKey}});

function uploadS3(file_path, bucket, key, cb){
  fs.readFile(file_path, (err, file) => {
    s3.upload({Bucket: secrets.aws.s3_main_bkt_name + '/' + bucket, Key: key, Body: file, ACL: 'public-read'}).send(cb);
  });
}



function handleErr(err){
  if (!err) return;
  console.log('--------------err------------------');
  console.log(err);
  console.log('--------------///------------------');
  Err.create({e: err, msg: err}, (er)=>{if (er) console.log(err);});
}

function microsoftReq(imgUrl, lang, cb){
  request({
    url: 'https://api.projectoxford.ai/vision/v1/ocr?language='+lang+'&detectOrientation=true', 
    method: 'POST',
    headers: {'Ocp-Apim-Subscription-Key': '185505f2275d43e4a2ce28d845f0a984', 'content-type': 'application/json; charset=UTF-8'}, 
    json: {Url: imgUrl}, 
  }, function(err,httpResponse,body) {
    if (err) return cb(err);
    cb(null, objectToText(body));
  });
}

function objectToText(o){
  let s = "";
  o.regions.forEach((region)=>{
    region.lines.forEach((line)=>{
      s += line.words.map((word) => word.text).join(' ');
    });
  });
  return s;
}