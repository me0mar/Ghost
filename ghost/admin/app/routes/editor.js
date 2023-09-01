import $ from 'jquery';
import AuthenticatedRoute from 'ghost-admin/routes/authenticated';
import {run} from '@ember/runloop';
import {inject as service} from '@ember/service';

export default AuthenticatedRoute.extend({
    feature: service(),
    notifications: service(),
    ui: service(),

    classNames: ['editor'],

    beforeModel(transition) {
        // redirect to the beta editor so the post gets auto-migrated
        if (this.feature.lexicalEditor) {
            const {name} = transition.to;
            const {type, post_id: id} = transition.to.params;

            if (name === 'editor.new') {
                return this.router.transitionTo('lexical-editor.new', type);
            } else if (name === 'editor.edit') {
                return this.router.transitionTo('lexical-editor.edit', type, id);
            }
        }
    },

    activate() {
        this._super(...arguments);
        this.ui.set('isFullScreen', true);
    },

    setupController(controller, model, transition) {
        if (transition.from?.name === 'posts.analytics' && transition.to?.name !== 'editor.new') {
            controller.fromAnalytics = true;
        }
    },

    resetController(controller) {
        controller.fromAnalytics = false;
    },

    deactivate() {
        this._super(...arguments);
        this.ui.set('isFullScreen', false);
    },

    actions: {
        save() {
            this._blurAndScheduleAction(function () {
                this.controller.send('save');
            });
        },

        authorizationFailed() {
            // noop - re-auth is handled by controller save
            return;
        },

        willTransition(transition) {
            // exit early if an upgrade is required because our extended route
            // class will abort the transition and show an error
            if (this.get('upgradeStatus.isRequired')) {
                return this._super(...arguments);
            }

            this.controller.willTransition(transition);
        }
    },

    buildRouteInfoMetadata() {
        return {
            titleToken: () => {
                return this.get('controller.post.title') || 'Editor';
            },
            bodyClasses: ['gh-body-fullscreen'],
            mainClasses: ['gh-main-white']
        };
    },

    _blurAndScheduleAction(func) {
        let selectedElement = $(document.activeElement);

        // TODO: we should trigger a blur for textareas as well as text inputs
        if (selectedElement.is('input[type="text"]')) {
            selectedElement.trigger('focusout');
        }

        // wait for actions triggered by the focusout to finish before saving
        run.scheduleOnce('actions', this, func);
    }
});
