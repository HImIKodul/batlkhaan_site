import React, {memo} from 'react';
import type {RouteName} from './AppShell';
import {DOMAIN_IDS} from '../design/domainTheme';

/** The same static optical field is refracted by the page rim and clear panels.
 * CSS owns the shared registration; no route animation or per-frame SVG filters. */
export const GlassStage=memo(function GlassStage({route}:{route:RouteName}){
 return <div className="crystal-stage" data-route={route} aria-hidden="true"><div className="crystal-stage__light"/>{DOMAIN_IDS.map(d=><i key={d} className="crystal-stage__wash" data-d={d}/>)}</div>;
});
