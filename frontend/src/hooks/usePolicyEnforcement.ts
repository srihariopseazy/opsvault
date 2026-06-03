import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { RootState, AppDispatch } from '../store';
import { setPersonalVaultDisabled, setSendDisabled } from '../store/slices/uiSlice';
import { orgPoliciesApi } from '../api/orgPoliciesApi';
import { orgsApi } from '../api/orgsApi';
import { ROUTES } from '../utils/constants';

export function usePolicyEnforcement() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const isUnlocked = useSelector((s: RootState) => s.vault.isUnlocked);
  const user = useSelector((s: RootState) => s.auth.user);

  useEffect(() => {
    if (!isUnlocked || !user) return;

    (async () => {
      try {
        const { data: orgs } = await orgsApi.listOrgs();
        if (!orgs || orgs.length === 0) return;

        let personalVaultDisabled = false;
        let sendDisabled = false;
        let twoFaRequired = false;

        for (const org of orgs) {
          try {
            const { data } = await orgPoliciesApi.getPolicies(org.uuid);
            for (const policy of data.policies) {
              if (!policy.enabled) continue;
              if (policy.policy_type === 'personal_vault_disabled') personalVaultDisabled = true;
              if (policy.policy_type === 'send_disabled') sendDisabled = true;
              if (policy.policy_type === 'two_factor_authentication') twoFaRequired = true;
            }
          } catch {
            // silently skip orgs where we can't fetch policies (e.g. non-admin)
          }
        }

        dispatch(setPersonalVaultDisabled(personalVaultDisabled));
        dispatch(setSendDisabled(sendDisabled));

        if (twoFaRequired && !user.totp_enabled) {
          navigate(ROUTES.POLICY_ENFORCEMENT, { replace: true });
        }
      } catch {
        // network errors — don't block the user
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnlocked]);
}
