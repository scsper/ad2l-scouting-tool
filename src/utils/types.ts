export type RecordStatus = "does_not_exist" | "loading" | "loaded" |"failed"

export type Position =
  | "POSITION_1"
  | "POSITION_2"
  | "POSITION_3"
  | "POSITION_4"
  | "POSITION_5"

export type Team = {
  id: number
  name: string
}

export type Player = {
  heroId: number
  steamAccountId: number
  isRadiant: boolean
  position: Position
}

export type PickBan = {
  isPick: boolean
  heroId: number
  order: number
  isRadiant: boolean
}

export type Match = {
  id: number
  didRadiantWin: boolean
  durationSeconds: number
  radiantTeam: Team
  direTeam: Team
  players: Player[]
  pickBans: PickBan[]
}
