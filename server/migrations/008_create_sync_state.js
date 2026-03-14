/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createTable('sync_state', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    provider: {
      type: 'varchar(20)',
      notNull: true,
    },
    sync_token: {
      type: 'text',
    },
    last_full_sync: {
      type: 'timestamptz',
    },
    last_sync: {
      type: 'timestamptz',
    },
  });

  pgm.addConstraint('sync_state', 'sync_state_user_id_provider_unique', {
    unique: ['user_id', 'provider'],
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropTable('sync_state');
};
