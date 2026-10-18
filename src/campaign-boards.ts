// The campaign's twenty-four boards, exactly as specs/campaign-boards.md lays
// them out, in play order. Set A is boards 1 to 6, Set B 7 to 12, Set C 13 to
// 18, and Set D 19 to 24.

export const CAMPAIGN_BOARDS: readonly (readonly string[])[] = [
  // Set A
  [".Tt", "ttT", ".tt"],
  [".tt", "TtT", "tt."],
  ["tTtt", "ttTt", "ttt."],
  ["Tt.t", "tTtt", ".ttt"],
  [".tTt", ".ttt", "ttTt", "tttt"],
  ["tttT", "ttt.", "t.tt", "ttTt"],
  // Set B
  ["STtt", "sstt", "ssTt", "Sss."],
  ["Sst..", "stTtt", "ssttt", "SsstT"],
  ["tSss", "2tss", "Ttss", "tTS."],
  ["Tt.T.", "ttt..", "t2sSs", "tSsss"],
  ["..t.s", "ttT2s", "ttS2S", "t.Tss"],
  ["Tttt.", "ttsSt", ".22t.", "ssST."],
  // Set C
  [".Ddd", "tTdD", "t22.", "tsSs", "T.S."],
  ["..tT.", "t2dD.", "T2t.s", "d2sss", "DSssS"],
  [".T.2t", "sDttt", "sS2Td", "ss22D", ".S.d."],
  ["..ttt", ".S2tt", "DsTsT", "d22d.", "SddD."],
  ["...ttd", "S2Ttdd", "t32Ddd", "Tss2d.", "sS.dD."],
  ["T.....", "ttDsss", "dd3222", ".dt3Ss", "DddTSs"],
  // Set D
  [".Dttt", ".dd3t", ".d2TT", "S2s2D", ".sSss"],
  [".S.tT.", "s2ttDd", "s2T2.d", "s22d3.", "ssSddD"],
  ["S2D..T", "d2ssts", ".D3S3s", ".dT32t", ".d2tt."],
  [".tt2d.", ".t2t2d", "t1DdSd", "2.S3dD", "TT2sd.", ".ssss."],
  ["s2SST..", "2232.t.", "stTsttt", "..t.t.t", "d22ttdD", "dD2dddd"],
  ["ssdd.d.", "2S.dd2d", "ssD..d.", "t2ttTdd", ".t323Dd", "ttT2sS."],
];

/** The number of boards in a set, and so the width of the select grid. */
export const SET_SIZE = 6;
