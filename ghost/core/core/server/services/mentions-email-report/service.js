const MentionEmailReportJob = require('@tryghost/mentions-email-report');

/**
 * @typedef {import('@tryghost/mentions-email-report/lib/mentions-email-report').MentionReport} MentionReport
 * @typedef {import('@tryghost/mentions-email-report/lib/mentions-email-report').MentionReportRecipient} MentionReportRecipient
 */

let initialised = false;

module.exports = {
    async init() {
        if (initialised) {
            return;
        }

        const mentions = require('../mentions');
        const mentionReportGenerator = {
            getMentionReport(startDate, endDate) {
                return mentions.api.getMentionReport(startDate, endDate);
            }
        };

        const models = require('../../models');
        const mentionReportRecipientRepository = {
            async getMentionReportRecipients() {
                const users = await models.User.getEmailAlertUsers('mention-received');
                return users.map((model) => {
                    return {
                        email: model.email,
                        slug: model.slug
                    };
                });
            }
        };

        const staffService = require('../staff');
        const mentionReportEmailView = {
            /**
             * @returns {Promise<string>}
             */
            async renderSubject() {
                return 'Mention Report';
            },

            /**
             * @param {MentionReport} report
             * @param {MentionReportRecipient} recipient
             * @returns {Promise<string>}
             */
            async renderHTML(report, recipient) {
                return staffService.api.emails.renderHTML('mention-report', {
                    report: report,
                    recipient: recipient,
                    hasMoreMentions: report.mentions.length > 5
                });
            },

            /**
             * @param {MentionReport} report
             * @param {MentionReportRecipient} recipient
             * @returns {Promise<string>}
             */
            async renderText(report, recipient) {
                return staffService.api.emails.renderText('mention-report', {
                    report: report,
                    recipient: recipient
                });
            }
        };

        const settingsCache = require('../../../shared/settings-cache');
        const mentionReportHistoryService = {
            async getLatestReportDate() {
                const setting = settingsCache.get('lastMentionsReportEmailTimestamp');
                const parsedDate = Date.parse(setting);

                // Protect against missing/bad data
                if (Number.isNaN(parsedDate)) {
                    const date = new Date();
                    date.setDate(date.getDate() - 1);
                    return date;
                }

                return new Date(parsedDate);
            },
            async setLatestReportDate(date) {
                await models.Settings.edit({
                    key: 'lastMentionsReportEmailTimestamp',
                    value: date
                });
            }
        };

        const mail = require('../mail');
        const mailer = new mail.GhostMailer();
        const emailService = {
            async send(to, subject, html, text) {
                return mailer.send({
                    to,
                    subject,
                    html,
                    text
                });
            }
        };

        const job = new MentionEmailReportJob({
            mentionReportGenerator,
            mentionReportRecipientRepository,
            mentionReportEmailView,
            mentionReportHistoryService,
            emailService
        });

        const mentionsJobs = require('../mentions-jobs');

        const DomainEvents = require('@tryghost/domain-events');
        const StartMentionEmailReportJob = require('./StartMentionEmailReportJob');

        const labs = require('../../../shared/labs');
        DomainEvents.subscribe(StartMentionEmailReportJob, () => {
            if (labs.isSet('webmentionEmails')) {
                job.sendLatestReport();
            }
        });

        // Kick off the job on boot, this will make sure that we send a missing report if needed
        DomainEvents.dispatch(StartMentionEmailReportJob.create());

        const s = Math.floor(Math.random() * 60); // 0-59
        const m = Math.floor(Math.random() * 60); // 0-59

        // Schedules a job every hour at a random minute and second to send the latest report
        mentionsJobs.addJob({
            name: 'mentions-email-report',
            job: require('path').resolve(__dirname, './job.js'),
            at: `${s} ${m} * * * *`
        });

        initialised = true;
    }
};