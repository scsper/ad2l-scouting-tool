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

export type PlayerApiResponse = {
  heroId: number
  steamAccount: SteamAccount
  isRadiant: boolean
  position: Position
}

export type SteamAccount = {
  id: number
  name: string
}


export type PickBanApiResponse = {
  isPick: boolean
  heroId: number
  order: number
  isRadiant: boolean
}

export type MatchApiResponse = {
  id: number
  didRadiantWin: boolean
  durationSeconds: number
  radiantTeam: Team
  direTeam: Team
  players: PlayerApiResponse[]
  pickBans: PickBanApiResponse[] | null
}
