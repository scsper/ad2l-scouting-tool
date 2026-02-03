import { getHero } from "./get-hero.js";

function getRelativeTime(unixTimestamp) {
  const now = Date.now();
  const timestamp = unixTimestamp * 1000;
  const diffInSeconds = Math.floor((now - timestamp) / 1000);

  if (diffInSeconds < 60) {
    return 'just now';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`;
  }

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return `${diffInWeeks} week${diffInWeeks === 1 ? '' : 's'} ago`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    if (diffInMonths === 0) {
      return '4 weeks ago';
    }
    return `${diffInMonths} month${diffInMonths === 1 ? '' : 's'} ago`;
  }

  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears} year${diffInYears === 1 ? '' : 's'} ago`;
}

export function printReport(heroesGroupBy) {
  heroesGroupBy.sort((a, b) => b.matchCount - a.matchCount).forEach(hero => {
    const relativeTime = getRelativeTime(hero.lastMatchDateTime);

    console.log(`${getHero(hero.heroId)}: ${hero.winCount}-${hero.matchCount - hero.winCount} (${Math.round(hero.winCount / hero.matchCount * 100)}%), ${relativeTime}`);
  });
}
