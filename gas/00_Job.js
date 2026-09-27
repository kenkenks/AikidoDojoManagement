/**
 * Job
 *
 * 「仕事」を表す概念スーパークラス。
 * 各工程は Job を構成する概念要素であり、具体 Job で処理が不要な工程は
 * この標準実装（何もしない）をそのまま継承する。
 */
class Job {
  execute() {}
  prepare() {}
  collect() {}
  make() {}
  record() {}
  post() {}
  cleanup() {}
}
