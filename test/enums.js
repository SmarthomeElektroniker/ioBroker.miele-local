'use strict';

const { expect } = require('chai');
const enums = require('../lib/enums');
const enumsDe = require('../lib/enums_de');

describe('Enums: Program and Phase Resolution', () => {
    it('resolves generic phase IDs (1-6) for dishwashers in EN and DE', () => {
        expect(enums.phaseText(7, 1)).to.equal('pre_dishwash');
        expect(enums.phaseText(7, 2)).to.equal('cleaning');
        expect(enums.phaseText(7, 3)).to.equal('interim_rinse');
        expect(enums.phaseText(7, 4)).to.equal('final_rinse');
        expect(enums.phaseText(7, 5)).to.equal('drying');
        expect(enums.phaseText(7, 6)).to.equal('finished');

        expect(enumsDe.phaseDe(7, 1)).to.equal('Vorspülen');
        expect(enumsDe.phaseDe(7, 2)).to.equal('Reinigen');
        expect(enumsDe.phaseDe(7, 3)).to.equal('Zwischenspülen');
        expect(enumsDe.phaseDe(7, 4)).to.equal('Klarspülen');
        expect(enumsDe.phaseDe(7, 5)).to.equal('Trocknen');
        expect(enumsDe.phaseDe(7, 6)).to.equal('Ende');
    });

    it('resolves semi-prof dishwasher (DeviceType 8) to dishwasher tables', () => {
        expect(enums.programText(8, 201)).to.equal('automatic');
        expect(enums.phaseText(8, 2)).to.equal('cleaning');
        expect(enumsDe.phaseDe(8, 2)).to.equal('Reinigen');
    });

    it('resolves generic phase IDs (1-9) for washing machines in EN and DE', () => {
        expect(enums.phaseText(1, 1)).to.equal('pre_wash');
        expect(enums.phaseText(1, 3)).to.equal('main_wash');
        expect(enums.phaseText(1, 6)).to.equal('spin');
        expect(enums.phaseText(1, 9)).to.equal('finished');

        expect(enumsDe.phaseDe(1, 1)).to.equal('Vorwäsche');
        expect(enumsDe.phaseDe(1, 3)).to.equal('Waschen');
        expect(enumsDe.phaseDe(1, 6)).to.equal('Schleudern');
        expect(enumsDe.phaseDe(1, 9)).to.equal('Ende');
    });

    it('resolves tumble dryer (DeviceType 2) phases correctly in EN and DE', () => {
        expect(enums.phaseText(2, 1)).to.equal('drying');
        expect(enums.phaseText(2, 4)).to.equal('finished');

        expect(enumsDe.phaseDe(2, 1)).to.equal('Trocknen');
        expect(enumsDe.phaseDe(2, 4)).to.equal('Ende');
    });

    it('resolves warming drawer (DeviceType 25 and 67) and combi steam oven (DeviceType 31)', () => {
        expect(enums.BY_TYPE[25]).to.exist;
        expect(enums.BY_TYPE[25].program).to.equal('DishWarmerProgramId');
        expect(enums.programText(25, 1)).to.equal('warm_cups_glasses');

        expect(enums.BY_TYPE[31]).to.exist;
        expect(enums.BY_TYPE[31].program).to.equal('OvenProgramId');
        expect(enums.programText(31, 6)).to.equal('eco_fan_heat');
    });

    it('resolves status codes 144 and 145 in EN and DE', () => {
        expect(enums.statusText(144)).to.equal('default');
        expect(enums.statusText(145)).to.equal('locked');
        expect(enumsDe.statusDe(144)).to.equal('Standard');
        expect(enumsDe.statusDe(145)).to.equal('Gesperrt');
    });

    it('resolves program type 3 as cleaning and care program in EN and DE', () => {
        expect(enums.programTypeText(3)).to.equal('cleaning_care_program');
        expect(enumsDe.programTypeDe(3)).to.equal('Reinigungs-/Pflegeprogramm');
    });

    it('ensures every non-empty phase across all phase tables has a German translation', () => {
        for (const [tableName, table] of Object.entries(enums.TABLES)) {
            if (!tableName.startsWith('ProgramPhase')) continue;
            for (const [, val] of Object.entries(table)) {
                if (!val || val === 'not_running') continue;
                expect(enumsDe.PhaseNameDe[val], `Missing translation for phase "${val}" in PhaseNameDe`).to.exist;
            }
        }
    });
});
