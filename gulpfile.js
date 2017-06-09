var paths = {
  stylus: 'public/css/stylus/**/*.styl',
  front: ['app/views/**/*.{html,ejs}','public/js/**/*.js'],
  supervisor: ['app/controllers', 'app/models', 'index.js', 'config'],
  js: 'public/js/src/*'
}

var gulp = require('gulp');
var stylus = require('gulp-stylus');
var concat = require('gulp-concat');
var livereload = require('gulp-livereload');
var supervisor = require( "gulp-supervisor" );
var sourcemaps = require('gulp-sourcemaps');
var uglify = require('gulp-uglify');

gulp.task('stylus', function() {
  gulp.src(paths.stylus)
    .pipe(stylus({compress: true}))
    .pipe(concat('style.css'))
    .pipe(gulp.dest('public/css/'))
    .pipe(livereload());
});

gulp.task('reload_page', function() {
  livereload.reload();
});

gulp.task('watch', function() {
  livereload.listen(); //comment if you don't want livereload
  gulp.watch(paths.stylus, ['stylus']);
  gulp.watch(paths.front, ['reload_page']);
  gulp.watch(paths.js, ['scripts']);
});

gulp.task("s", function() {
  supervisor("index.js", {
    exec: 'node',
    watch: paths.supervisor
  });
});


gulp.task('scripts', function() {
  gulp.src(paths.js)
    .pipe(sourcemaps.init())
      .pipe(uglify())
      .pipe(concat('all.min.js'))
    .pipe(sourcemaps.write())
    .pipe(gulp.dest('public/js'));
});

gulp.task('default', ['s', 'watch', 'scripts']);

