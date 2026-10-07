import { useEffect, useState } from 'react';
import { getPlanCollaborators } from '../../api/planMemberApi';
import type { PlanCollaboratorResponse } from '../../types/plan';

interface Props {
  planId: number;
  refreshVersion: number;
}

export default function PlanCollaboratorsBar({ planId, refreshVersion }: Props) {
  const [collaborators, setCollaborators] = useState<PlanCollaboratorResponse[]>([]);

  useEffect(() => {
    let active = true;
    getPlanCollaborators(planId)
      .then(value => { if (active) setCollaborators(value); })
      .catch(() => { if (active) setCollaborators([]); });
    return () => { active = false; };
  }, [planId, refreshVersion]);

  if (collaborators.length < 2) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-slate-500" aria-label="계획 참여자">
      <span className="font-semibold text-slate-600">함께 작성하는 사람</span>
      <span aria-hidden="true">·</span>
      <span>{collaborators.map(person => `${person.nickname}${person.role === 'OWNER' ? ' (계획 주인)' : ''}`).join(' · ')}</span>
    </div>
  );
}
